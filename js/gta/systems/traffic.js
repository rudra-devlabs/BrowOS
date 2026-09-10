    // ===========================================================================
    // TRAFFIC — signal phases + lane-graph driver AI + spawn/recycle
    // ===========================================================================
    /**
     * Global signal phases on a 20 s cycle:
     *    0.0 -  7.0  NS green
     *    7.0 -  9.0  NS amber
     *    9.0 - 10.0  all red   <- the box empties before the cross street moves
     *   10.0 - 17.0  EW green
     *   17.0 - 19.0  EW amber
     *   19.0 - 20.0  all red
     * The clearance interval matters: without it EW goes green in the same
     * instant NS loses it, so two cars can both be legally inside one junction.
     * Lens colours are only rewritten on a phase change.
     */
    class TrafficLightSystem {
        constructor(city) {
            this.city = city;
            this.phaseIdx = -1;
        }
        /** Phase index for a time. See the class comment for the intervals. */
        static phaseAt(time) {
            const t = time % 20;
            if (t < 7) return 0;
            if (t < 9) return 1;
            if (t < 10) return 4;
            if (t < 17) return 2;
            if (t < 19) return 3;
            return 4;
        }
        /** 'green' | 'yellow' | 'red' for a travel axis ('ns' | 'ew'). */
        stateFor(axis, time) {
            const p = TrafficLightSystem.phaseAt(time);
            if (axis === 'ns') return p === 0 ? 'green' : p === 1 ? 'yellow' : 'red';
            return p === 2 ? 'green' : p === 3 ? 'yellow' : 'red';
        }
        /** Seconds of green left on this axis, 0 if it has not got one. */
        greenLeft(axis, time) {
            const t = time % 20;
            if (axis === 'ns') return t < 7 ? 7 - t : 0;
            return (t >= 10 && t < 17) ? 17 - t : 0;
        }
        static axisFor(edge) {
            const dir = edge.seg.dir;
            return dir === 'ew' ? 'ew' : 'ns'; // diagonals act N-S
        }
        update(time) {
            const idx = TrafficLightSystem.phaseAt(time);
            if (idx === this.phaseIdx) return;
            this.phaseIdx = idx;
            if (this.city && this.city.lightAt && this.city.lensMesh) {
                for (let i = 0; i < this.city.lightAt.length; i++) {
                    this.city.setLensColors(this.city.lightAt[i], idx);
                }
            }
        }
    }

    /**
     * Automated barrier gates on the car-park driveways.
     *
     * Two InstancedMeshes cover every gate in the city — one for the striped
     * stanchions, which are written once and never touched again, one for the
     * booms, rewritten only on the frames an arm is actually moving.
     *
     * The proximity sensor is directional on purpose. A plain radius test opens
     * every gate on the avenue as traffic streams past the kerb, so a gate only
     * reacts to something whose direction of travel agrees with the way through
     * it, or to something already stopped at the bar.
     */
    class ParkingGateSystem {
        constructor(scene, mat, gates) {
            this.gates = gates || [];
            this.field = null;                  // set by the game after wiring
            this.peds = null;
            this.housing = null; this.boom = null;
            this._d = new THREE.Object3D();
            if (!this.gates.length) return;
            const n = this.gates.length;
            // --- stanchion: yellow/black striped post with a warning lamp ---
            const hb = new GeoBatch();
            const dark = col3(0x24262a), yel = col3(0xf2c20e);
            hb.box(0, 0.06, 0, 0.62, 0.12, 0.62, col3(0x3a3d42));
            for (let i = 0; i < 4; i++) {
                hb.box(0, 0.20 + i * 0.24, 0, 0.44, 0.24, 0.44, i % 2 ? yel : dark);
            }
            hb.box(0, 1.14, 0, 0.30, 0.16, 0.30, col3(0xff7a1a));
            this.housing = new THREE.InstancedMesh(hb.buildGeometry(), mat, n);
            // --- boom: red/white banded, pivot at the origin, running along +X
            const bb = new GeoBatch();
            const L = this.gates[0].len;
            const bands = Math.max(4, Math.round(L / 0.62));
            const bl = L / bands;
            for (let i = 0; i < bands; i++) {
                bb.box(bl * (i + 0.5), 0, 0, bl, 0.15, 0.15,
                    i % 2 ? col3(0xf2f2f2) : col3(0xd8322a));
            }
            bb.box(L, 0, 0, 0.12, 0.24, 0.24, col3(0xd8322a));
            this.boom = new THREE.InstancedMesh(bb.buildGeometry(), mat, n);
            // Procedural red barrier removed per instruction: realistic animated GLB barrier is used instead
            // scene.add(this.housing);
            // scene.add(this.boom);
            const d = this._d;
            for (let i = 0; i < n; i++) {
                const g = this.gates[i];
                g.gi = i;
                d.position.set(g.px, 0, g.pz);
                d.rotation.set(0, g.yaw, 0);
                d.scale.set(1, 1, 1);
                d.updateMatrix();
                this.housing.setMatrixAt(i, d.matrix);
            }
            this.housing.instanceMatrix.needsUpdate = true;
            this._writeBooms();
        }

        /**
         * Four states, and the eased curves are inverted exactly on a reversal:
         * a car arriving halfway through a close makes the arm go back up from
         * where it is, not from where a fresh open would have started it.
         *   closed -> opening (1.2 s ease-out) -> open (holds while occupied,
         *   then 1.5 s of clearance) -> closing (1.5 s ease-in) -> closed
         */
        update(dt, time) {
            const gs = this.gates;
            if (!gs.length) return;
            const vs = this.field ? this.field.vehicles : null;
            const peds = this.peds && this.peds.renderer ? this.peds.renderer.peds : null;
            let moved = false;
            for (let i = 0; i < gs.length; i++) {
                const g = gs[i];
                const want = this._sense(g, vs, peds);
                if (g.state === 0) {
                    if (want) { g.state = 1; g.t = 0; }
                } else if (g.state === 1) {
                    g.t += dt;
                    if (g.t >= 1.2) { g.t = 1.2; g.k = 1; g.state = 2; g.hold = 1.5; }
                    else { const iu = 1 - g.t / 1.2; g.k = 1 - iu * iu * iu; }
                    moved = true;
                } else if (g.state === 2) {
                    g.k = 1;
                    if (want) g.hold = 1.5;
                    else if ((g.hold -= dt) <= 0) { g.state = 3; g.t = 0; }
                } else {
                    if (want) {
                        // Invert the closing curve to find the equivalent point
                        // on the opening one, so the arm changes direction from
                        // exactly where it is.
                        g.state = 1;
                        g.t = 1.2 * (1 - Math.cbrt(Math.max(0, 1 - g.k)));
                    } else {
                        g.t += dt;
                        if (g.t >= 1.5) { g.t = 0; g.k = 0; g.state = 0; }
                        else { const u = g.t / 1.5; g.k = 1 - u * u; }
                    }
                    moved = true;
                }
                // A boom that is still substantially down is solid. The static
                // collider set is snapshotted at build time and cannot be
                // toggled per frame, so the barrier does its own push.
                if (g.k < 0.22) this._block(g, vs, peds);
            }
            if (moved) this._writeBooms();
        }

        /**
         * Is anything asking to come through? Directional: within 5.5 m AND
         * travelling roughly the way the gate faces. Parked cars are skipped
         * outright — a car sitting in the south row is three metres from the
         * exit sensor and pointed the right way, and would hold the arm up for
         * ever.
         */
        _sense(g, vs, peds) {
            if (vs) {
                for (let i = 0; i < vs.length; i++) {
                    const v = vs[i];
                    if (v.gone || v.parked || v.dead) continue;
                    const dx = v.x - g.sx, dz = v.z - g.sz;
                    const d2 = dx * dx + dz * dz;
                    if (d2 > 5.5 * 5.5) continue;
                    // A reversing car is travelling backwards along its nose,
                    // which is how a car leaving a bay reaches the exit gate.
                    const sgn = v.speed < -0.2 ? -1 : 1;
                    const fx = -Math.sin(v.heading) * sgn, fz = -Math.cos(v.heading) * sgn;
                    if (fx * g.nx + fz * g.nz < 0.65) continue;
                    // Stopped and still well back is a car waiting at the kerb
                    // for other reasons; stopped at the bar is a car asking.
                    if (Math.abs(v.speed) < 0.35 && d2 > 4.2 * 4.2) continue;
                    return true;
                }
            }
            if (peds) {
                for (let i = 0; i < peds.length; i++) {
                    const p = peds[i];
                    if (p.state === 'dead') continue;
                    const dx = p.x - g.sx, dz = p.z - g.sz;
                    const d2 = dx * dx + dz * dz;
                    if (d2 > 5.5 * 5.5) continue;
                    const sp = Math.hypot(p.vx, p.vz);
                    if (sp < 0.25) {
                        if (d2 < 2.4 * 2.4) return true;  // stopped at the bar
                        continue;
                    }
                    if ((p.vx / sp) * g.nx + (p.vz / sp) * g.nz > 0.65) return true;
                }
            }
            return false;
        }

        /**
         * Keep vehicles on their own side of a lowered boom. Both booms are
         * axis-aligned along x, so this is an interval test on x and a signed
         * distance on z rather than a general OBB.
         */
        _block(g, vs, peds) {
            // Procedural red barrier removed per instruction; entry/exit is handled cleanly by GLB barrier
            return;
        }

        /** Local +X becomes the boom, so its roll is the raise angle. */
        _writeBooms() {
            const d = this._d;
            for (let i = 0; i < this.gates.length; i++) {
                const g = this.gates[i];
                d.position.set(g.px, 0.95, g.pz);
                d.rotation.set(0, g.yaw, g.k * Math.PI / 2);
                d.scale.set(1, 1, 1);
                d.updateMatrix();
                this.boom.setMatrixAt(i, d.matrix);
            }
            this.boom.instanceMatrix.needsUpdate = true;
        }
    }

    /**
     * A* over the directed lane graph, keyed on EDGES rather than nodes: turn
     * legality lives on the edges — one-way avenues, no U-turns — so a search
     * that reasoned about nodes alone would happily plan routes no car can
     * actually drive. Preallocated and generation-stamped like the sidewalk
     * router, because a car replanning as it enters a junction must not
     * allocate.
     */
    class RoadRouter {
        constructor(map) {
            this.map = map;
            const n = map.edges.length;
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
            this.full = n + 8;
            this.pops = 0;
        }

        _push(id, f) {
            if (this.hN + 1 >= this.cap) return;
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
         * Cheapest legal drive from `startEdge` to any edge arriving at node
         * `goalNode`, written into `out` as edge objects in travel order
         * (`startEdge` excluded). Turns cost time, reversals cost a lot, and
         * side streets carry a small surcharge — so cars run the avenues and
         * turn off them only when the trip needs it.
         */
        find(startEdge, goalNode, out, budget) {
            out.length = 0;
            const edges = this.map.edges, nodes = this.map.nodes;
            const goal = nodes[goalNode];
            if (!startEdge || !goal) return false;
            const gen = ++this.gen;
            const h = (e) => {
                const n = nodes[e.to];
                return (Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z)) * 1.05;
            };
            this.hN = 0;
            const s = startEdge.id;
            this.stamp[s] = gen; this.g[s] = 0; this.closed[s] = 0; this.came[s] = -1;
            this._push(s, h(startEdge));
            let pops = 0;
            const cap = budget || this.full;
            while (this.hN > 0 && pops < cap) {
                const cur = this._pop();
                if (this.stamp[cur] !== gen || this.closed[cur]) continue;
                this.closed[cur] = 1;
                pops++;
                const ce = edges[cur];
                if (ce.to === goalNode && cur !== s) {
                    this.pops = pops;
                    for (let k = cur; k !== s && k !== -1; k = this.came[k]) out.push(edges[k]);
                    out.reverse();
                    return out.length > 0;
                }
                const nxs = ce.next;
                if (!nxs) continue;
                for (let k = 0; k < nxs.length; k++) {
                    const ne = nxs[k];
                    const dot = ne.dirX * ce.dirX + ne.dirZ * ce.dirZ;
                    let step = ne.length + (ne.seg.major ? 0 : 7);
                    if (dot < 0.75) step += 16;              // a turn costs a light cycle
                    if (dot < -0.2) step += 70;              // doubling back costs a trip
                    const ng = this.g[cur] + step;
                    const id = ne.id;
                    if (this.stamp[id] !== gen) {
                        this.stamp[id] = gen; this.closed[id] = 0;
                        this.g[id] = ng; this.came[id] = cur;
                        this._push(id, ng + h(ne));
                    } else if (!this.closed[id] && ng < this.g[id]) {
                        this.g[id] = ng; this.came[id] = cur;
                        this._push(id, ng + h(ne));
                    }
                }
            }
            this.pops = pops;
            return false;
        }
    }

    /**
     * One shape for every AI driver, built in one place. Four call sites used
     * to spell this literal out by hand, and a field added to only three of
     * them would quietly de-optimise every property read in aiStep.
     */
    function makeDriverAi(edge, t) {
        return {
            edge, t, stuck: 0, brakeFor: 0, jammedTimer: 0,
            route: null, ri: 0, dest: -1, nextEdge: null, nextFor: null,
            park: null, wantPark: null, parkT: 0, px0: 0, pz0: 0, ph0: 0,
            patrol: false,
            // Corner geometry — see TrafficSystem._makeFillet.
            turn: {
                on: false, t0: 0, t1: 0, total: 1, pace: 1, left: false,
                p0x: 0, p0z: 0, p1x: 0, p1z: 0, p2x: 0, p2z: 0,
                edge: null, next: null,
            },
            leftWait: 0,
            // Patience, overtaking, panic, unwedging.
            blockedTimer: 0, hornT: 0, panicT: 0,
            lane: 0, laneCur: 0, overT: 0, revT: 0, revSgn: 1,
            // Car-park ingress and egress.
            lot: null, stall: null, man: 0, mt: 0, bT: 0, bLen: 1,
            b0x: 0, b0z: 0, b1x: 0, b1z: 0, b2x: 0, b2z: 0,
        };
    }

    /**
     * Ambient traffic. Cars ride the lane graph, but they ride it with a
     * destination: each one routes across town with RoadRouter, slows for its
     * turns, obeys the lights, keeps its distance, and takes turns with cross
     * traffic at junctions with no signal — the box is claimed, one car at a
     * time, and an avenue claims it from further out than a side street does.
     */
    class TrafficSystem {
        constructor(field, map, lights, physics) {
            this.field = field;
            this.map = map;
            this.lights = lights;
            this.physics = physics;
            this.peds = null;
            this.target = 34;
            this.types = [
                'sedan', 'sedan', 'compact', 'compact', 'coupe', 'wagon', 'suv', 'pickup',
                'luxury_sedan', 'luxury_limo', 'supercar_hyper', 'supercar_track', 'taxi', 'taxi',
                'police_cruiser', 'police_suv', 'ambulance', 'firetruck', 'garbage_truck',
                'bus_city', 'bus_coach', 'truck_box', 'truck_semi',
                'bike_sport', 'bike_cruiser', 'bike_dirt',
                'muscle', 'minivan', 'van', 'offroad'
            ];
            this.spawnCd = 0;
            this._q = [];
            this.router = new RoadRouter(map);
            /** node id -> { v, exp }: who owns an unsignalized junction box. */
            this.claims = new Map();
            this._replans = 0;
            this.stats = { plans: 0, planFails: 0, yields: 0, arrivals: 0, gridlockBreaks: 0, parks: 0, unparks: 0, overtakes: 0, unwedges: 0, panics: 0 };
            this._time = 0;
            /** Horn budget + last known player position, read by _honk. */
            this._hornCd = 0;
            this._px = 0;
            this._pz = 0;
            // Types that may sit at a kerb, resolved once: filtering per tick
            // would allocate a throwaway array several times a second.
            this._parkTypes = this.types.filter(t => t !== 'bus' && t !== 'bus_city' && t !== 'bus_coach' && t !== 'schoolbus' && t !== 'truck' && t !== 'truck_box' && t !== 'semi' && t !== 'truck_semi' && t !== 'garbage' && t !== 'garbage_truck' && t !== 'towtruck' && t !== 'limo' && t !== 'luxury_limo');
        }

        /** Fill parked spots (static cars near the player's start). */
        seedParked(rng) {
            const spots = this.map.parkedSpots;
            let placed = 0;
            const want = Math.min(220, spots.length);
            const perTypeCap = {}; // generous pool cap
            for (const t in VEHICLE_TYPES) perTypeCap[t] = Math.max(8, (VEHICLE_TYPES[t].pool * 0.8) | 0);
            perTypeCap['ambulance'] = 14;
            perTypeCap['police'] = 14;
            perTypeCap['police_cruiser'] = 14;
            perTypeCap['police_suv'] = 10;
            perTypeCap['police_enforcer'] = 8;

            // 1. Guaranteed seeding in primary parking lots so player always finds cars ready to drive
            const primaryLots = ['police_hq', 'hospital_campus', 'parking_midtown', 'parking_fidi', 'parking_bk', 'parking_uptown'];
            const primaryOrder = [];
            for (const lotId of primaryLots) {
                const lotStalls = spots.filter(s => s.lotId === lotId);
                // Seed all stalls for police_hq and hospital_campus so dummy cars are 100% replaced
                const step = (lotId === 'police_hq' || lotId === 'hospital_campus') ? 1 : 2;
                for (let i = 0; i < lotStalls.length; i += step) {
                    primaryOrder.push(lotStalls[i]);
                }
            }

            // 2. Remaining lot spots and street spots deterministic shuffle
            const primarySet = new Set(primaryOrder);
            const otherLotSpots = spots.filter(s => s.isLotSpot && !primarySet.has(s));
            const streetSpots = spots.filter(s => !s.isLotSpot);
            const order = [
                ...primaryOrder.map(s => ({ s })),
                ...otherLotSpots.map(s => ({ s, k: rng() })).sort((a, b) => a.k - b.k).slice(0, Math.ceil(otherLotSpots.length * 0.45)),
                ...streetSpots.map(s => ({ s, k: rng() })).sort((a, b) => a.k - b.k),
            ];
            for (const { s } of order) {
                if (placed >= want) break;
                let types;
                if (s.lotId === 'police_hq') {
                    types = ['police', 'police_cruiser', 'police_suv', 'police_enforcer'];
                } else if (s.lotId === 'hospital_campus') {
                    types = s.isAmbulanceBay
                        ? ['ambulance']
                        : ['sedan', 'suv', 'minivan', 'coupe', 'hatchback', 'compact'];
                } else {
                    types = s.isLotSpot
                        ? ['supercar_hyper', 'supercar_track', 'coupe', 'sedan', 'luxury_sedan', 'suv', 'pickup', 'bike_sport', 'bike_cruiser', 'bike_dirt', 'compact', 'wagon', 'taxi']
                        : this._parkTypes;
                }
                let type = null;
                for (let i = 0; i < 8; i++) {
                    const cand = pick(types, rng);
                    if ((perTypeCap[cand] || 0) > 0) { type = cand; break; }
                }
                if (!type) continue;
                perTypeCap[type]--;
                const carColor = (s.lotId === 'police_hq' || s.isAmbulanceBay) ? 0xffffff : pick(PAINTS, rng);
                const v = this.field.spawn(type, s.x, s.z, s.heading, { parked: true, color: carColor });
                if (v) {
                    if (s.isLotSpot) v.lotSpot = s;
                    placed++;
                }
            }

            // 3. Guaranteed moored motorboats in water at harbor docks & marinas
            const boatDocks = [
                { type: 'boat_speedboat', x: 520,  z: 3435, heading: 1.57 },
                { type: 'boat_police',    x: 555,  z: 3440, heading: 1.57 },
                { type: 'boat_yacht',     x: 485,  z: 3445, heading: 1.57 },
                { type: 'boat_speedboat', x: -28,  z: 2050, heading: 0.00 },
                { type: 'boat_yacht',     x: -30,  z: 2180, heading: 0.00 },
                { type: 'boat_police',    x: 1180, z: 2400, heading: 3.14 },
                { type: 'boat_speedboat', x: 1195, z: 2520, heading: 3.14 },
            ];
            for (const b of boatDocks) {
                const bv = this.field.spawn(b.type, b.x, b.z, b.heading, { parked: true });
                if (bv) {
                    bv.safeParked = true;
                    placed++;
                }
            }
            return placed;
        }

        update(dt, time, px, pz, fx) {
            this._time = time;
            this._px = px; this._pz = pz;
            if (this._hornCd > 0) this._hornCd -= dt;
            this.spawnCd -= dt;
            if (this.spawnCd <= 0) {
                this.spawnCd = 0.4;
                this._trySpawn(px, pz);
                this._recycle(px, pz);
                this._serviceHandovers();
                this._topUpParked(px, pz);
            }
            this._replans = 2;          // A* budget per frame, same as the peds
            const vs = this.field.vehicles;
            for (let i = vs.length - 1; i >= 0; i--) {
                const v = vs[i];
                if (v.driver !== 'ai' || v.driver === 'player' || v.isPlayerVehicle) continue;
                this.aiStep(v, dt, time, fx);
            }
        }

        _trySpawn(px, pz) {
            let traffic = 0;
            for (const v of this.field.vehicles) if (v.driver === 'ai' && !v.parked) traffic++;
            if (traffic >= this.target) return;
            const edges = this.map.edges;
            // Up to 4 cars per tick: pick a point in the 80-300 m ring around
            // the player, find the nearest lane edge, spawn there.
            for (let attempt = 0; attempt < 4 && traffic < this.target; attempt++) {
                const ang = Math.random() * Math.PI * 2;
                const r = 80 + Math.random() * 220;
                const sx = px + Math.cos(ang) * r, sz = pz + Math.sin(ang) * r;
                let best = null, bestD = Infinity, bestT = 0;
                for (const e of edges) {
                    const dx = e.bx - e.ax, dz = e.bz - e.az;
                    const len2 = dx * dx + dz * dz;
                    let t = len2 > 0 ? ((sx - e.ax) * dx + (sz - e.az) * dz) / len2 : 0;
                    t = clamp(t, 0.15, 0.85);
                    const cx = e.ax + dx * t, cz = e.az + dz * t;
                    const d2 = (cx - sx) * (cx - sx) + (cz - sz) * (cz - sz);
                    if (d2 < bestD) { bestD = d2; best = e; bestT = t; }
                }
                if (!best) continue;
                const e = best;
                const mx = e.ax + (e.bx - e.ax) * bestT, mz = e.az + (e.bz - e.az) * bestT;
                if (dist2(mx, mz, px, pz) < 60 * 60) continue;
                let blocked = false;
                for (const v of this.field.vehicles) {
                    if (dist2(v.x, v.z, mx, mz) < 16 * 16) { blocked = true; break; }
                }
                if (blocked) continue;
                const type = this.types[(Math.random() * this.types.length) | 0];
                const t0 = e.length * bestT;
                const v = this.field.spawn(type, mx, mz,
                    Math.atan2(-e.dirX, -e.dirZ), { driver: 'ai' });
                if (v) {
                    v.ai = makeDriverAi(e, t0);
                    v.speed = e.speed * 0.6;
                    traffic++;
                }
            }
        }

        _recycle(px, pz) {
            const vs = this.field.vehicles;
            for (let i = vs.length - 1; i >= 0; i--) {
                const v = vs[i];
                if (v.driver === 'player' || v.isPlayerVehicle || (this.field && this.field.game && this.field.game.player && this.field.game.player.inVehicle === v)) continue;
                if (v.parked) {
                    // Cars the AI parked are ours to clean up; the ones seeded at
                    // startup stay put so the player's own street never empties.
                    if (v.tempPark && !v.dropOff && !v.claimedBy &&
                        dist2(v.x, v.z, px, pz) > 400 * 400) this.field.remove(v);
                    continue;
                }
                if (v.driver !== 'ai') continue;
                if (dist2(v.x, v.z, px, pz) > 400 * 400) this.field.remove(v);
            }
        }

        /**
         * Nearest kerbside slot to a point that nobody is sitting in or already
         * driving to. Called on arrival events and the top-up tick only — a few
         * times a minute — so a linear scan is the right shape here; the
         * occupancy test runs only when a spot beats the best so far, which for
         * unordered data is a handful of times per call.
         */
        _findSpot(x, z, maxD, time) {
            const spots = this.map.parkedSpots;
            let best = null, bestD = maxD * maxD;
            for (let i = 0; i < spots.length; i++) {
                const s = spots[i];
                // Weight the car parks: a driver with a choice takes the
                // marked bay over the kerb, which is what the lots are for.
                let d2 = dist2(s.x, s.z, x, z);
                if (s.lot) d2 *= 0.45;
                if (d2 >= bestD || s.claimT > time || this._spotTaken(s)) continue;
                best = s; bestD = d2;
            }
            if (best) best.claimT = time + 20;   // never send two cars to one kerb
            return best;
        }

        _spotTaken(s) {
            const vs = this.field.vehicles;
            for (let i = 0; i < vs.length; i++) {
                if (dist2(vs[i].x, vs[i].z, s.x, s.z) < 3.4 * 3.4) return true;
            }
            return false;
        }

        /**
         * The lane a stationary car should rejoin: nearest by distance, but
         * biased hard towards the one it already points along, so a car leaving
         * the kerb pulls forward into its own side of the road rather than
         * snapping across the centre line into oncoming traffic.
         */
        nearestEdge(x, z, heading) {
            const fwX = -Math.sin(heading), fwZ = -Math.cos(heading);
            const edges = this.map.edges;
            let best = null, bestScore = Infinity, bestT = 0;
            for (let i = 0; i < edges.length; i++) {
                const e = edges[i];
                const t = clamp((x - e.ax) * e.dirX + (z - e.az) * e.dirZ, 0, e.length);
                const d2 = dist2(e.ax + e.dirX * t, e.az + e.dirZ * t, x, z);
                if (d2 > 26 * 26) continue;
                const score = d2 - 220 * (e.dirX * fwX + e.dirZ * fwZ);
                if (score < bestScore) { bestScore = score; best = e; bestT = t; }
            }
            if (!best) return null;
            return { edge: best, t: clamp(bestT, 2, Math.max(2, best.length - 6)) };
        }

        /** A ped got in and shut the door: hand the car back to the AI. */
        _serviceHandovers() {
            const vs = this.field.vehicles;
            for (let i = vs.length - 1; i >= 0; i--) {
                const v = vs[i];
                if (v.driver === 'player' || v.isPlayerVehicle) continue;
                if (!v.wantsDrive) continue;
                v.wantsDrive = false;
                // Still sitting in a marked bay: there is no lane to be on
                // until it has reversed out and driven the lot to the exit.
                const st = v.lotSpot;
                if (st && st.lot && dist2(v.x, v.z, st.x, st.z) < 3.2 * 3.2) {
                    v.parked = false;
                    v.driver = 'ai';
                    v.claimedBy = null;
                    v.dropOff = false;
                    v.speed = 0;
                    v.ai = makeDriverAi(null, 0);
                    v.ai.lot = st.lot;
                    v.ai.stall = st;
                    v.ai.man = 7;                    // reverse out of the bay
                    v.lotSpot = null;
                    st.claimT = 0;
                    this.stats.unparks++;
                    continue;
                }
                v.lotSpot = null;
                const hit = this.nearestEdge(v.x, v.z, v.heading);
                if (!hit) continue;                  // no lane in reach: leave it parked
                v.parked = false;
                v.driver = 'ai';
                v.claimedBy = null;
                v.dropOff = false;
                v.speed = 0;                         // the rail lerp eases it out
                v.ai = makeDriverAi(hit.edge, hit.t);
                this.stats.unparks++;
            }
        }

        /**
         * Keep kerbs lived-in away from the start area. seedParked only fills
         * spots near spawn, so without this every street the player drives to
         * has bare parking. One car per tick, only while the local count is
         * short, and everything it adds is recyclable (tempPark) so crossing
         * the island cannot grow the vehicle list.
         */
        _topUpParked(px, pz) {
            const vs = this.field.vehicles;
            let near = 0;
            for (let i = 0; i < vs.length; i++) {
                const v = vs[i];
                if (v.parked && dist2(v.x, v.z, px, pz) < 220 * 220) near++;
            }
            if (near >= 34) return;
            const spots = this.map.parkedSpots;
            if (!spots.length || !this._parkTypes.length) return;
            for (let t = 0; t < 5; t++) {
                const s = spots[(Math.random() * spots.length) | 0];
                const d2 = dist2(s.x, s.z, px, pz);
                // Not in the player's face, not so far it is wasted work.
                if (d2 < 110 * 110 || d2 > 230 * 230 || s.claimT > this._time) continue;
                if (this._spotTaken(s)) continue;
                const type = this._parkTypes[(Math.random() * this._parkTypes.length) | 0];
                const v = this.field.spawn(type, s.x, s.z, s.heading, { parked: true, color: PAINTS[(Math.random() * PAINTS.length) | 0] });
                if (v) { v.tempPark = true; if (s.lot) v.lotSpot = s; }
                return;
            }
        }

        /** A junction node worth driving to: far enough to be a trip, not a hop. */
        _pickDest(v) {
            const nodes = this.map.nodes;
            let fallback = -1;
            for (let t = 0; t < 10; t++) {
                const i = (Math.random() * nodes.length) | 0;
                const n = nodes[i];
                if (!n.out.length) continue;
                const d2 = dist2(n.x, n.z, v.x, v.z);
                if (d2 > 160 * 160 && d2 < 750 * 750) return i;
                if (fallback < 0) fallback = i;
            }
            return fallback;
        }

        /** Give this car somewhere to be. False if the frame's A* budget is spent. */
        _plan(v, e) {
            const ai = v.ai;
            if (this._replans <= 0) return false;
            const dest = this._pickDest(v);
            if (dest < 0 || dest === e.to) return false;
            this._replans--;
            this.stats.plans++;
            if (!ai.route) ai.route = [];
            if (!this.router.find(e, dest, ai.route, this.router.full)) {
                this.stats.planFails++;
                ai.route = null;
                return false;
            }
            ai.ri = 0;
            ai.dest = dest;
            return true;
        }

        /**
         * Which way out of this junction. The route decides; if the car has
         * fallen off its route (rammed onto a different edge, or the plan ran
         * out) it replans, and only if that fails does it fall back to the old
         * habit of drifting straight on.
         */
        _chooseNext(v, e) {
            const ai = v.ai;
            if (ai.route) {
                if (ai.ri >= ai.route.length) {
                    ai.route = null;
                    this.stats.arrivals++;
                    // Half the cars that finish a trip go looking for a kerb
                    // instead of instantly inventing another errand — arriving
                    // somewhere is most of what makes traffic read as people.
                    // Patrol cars are working; they never park.
                    if (!ai.patrol && !ai.park && !ai.wantPark && Math.random() < 0.5) {
                        const n = this.map.nodes[e.to];
                        if (n) ai.wantPark = this._findSpot(n.x, n.z, 70, this._time);
                    }
                } else if (ai.route[ai.ri].from !== e.to) ai.route = null;
            }
            if (!ai.route) this._plan(v, e);
            if (ai.route && ai.ri < ai.route.length && ai.route[ai.ri].from === e.to) return ai.route[ai.ri];
            let best = null, bestScore = -Infinity;
            for (const c of e.next) {
                const dot = c.dirX * e.dirX + c.dirZ * e.dirZ;
                const score = dot * 2 + (c.seg.major ? 0.4 : 0) + Math.random() * 0.5;
                if (score > bestScore) { bestScore = score; best = c; }
            }
            return best;
        }

        /**
         * Right of way at a junction with no signal. The box is claimed by one
         * car at a time; an avenue claims from 20 m out and a side street only
         * from 13 m, so the side street is the one that ends up waiting. The
         * claim is refreshed while the car is in the approach and while it is
         * still inside the box, and lapses a fraction of a second after it
         * clears — no car ever holds a junction it has already left.
         */
        _claimJunction(v, e, nodeId, distEnd, time) {
            // Fast cars claim earlier: 20 m of warning is nothing at 14 m/s.
            const zone = Math.max(e.seg.major ? 20 : 13, Math.abs(v.speed) * 1.7);
            if (distEnd > zone) return true;
            const c = this.claims.get(nodeId);
            if (c && c.v !== v && c.exp > time && !c.v.dead) { this.stats.yields++; return false; }
            if (c) { c.v = v; c.exp = time + 0.6; } else this.claims.set(nodeId, { v, exp: time + 0.6 });
            return true;
        }

        aiStep(v, dt, time, fx) {
            if (v.driver !== 'ai' || v.driver === 'player' || v.isPlayerVehicle) return;
            const ai = v.ai;
            if (!ai || (!ai.edge && !ai.man)) { this.field.remove(v); return; }
            // Dead cars just coast to a stop.
            if (v.dead) {
                v.speed = Math.max(0, v.speed - 12 * dt);
                this.field.writeMatrix(v);
                if (v.speed < 0.1 && Math.random() < dt * 0.05) this.field.remove(v);
                return;
            }
            if (ai.panicT > 0) ai.panicT -= dt;
            if (ai.hornT > 0) ai.hornT -= dt;
            if (v.signal) v.signalT += dt;
            // --- pulling into a kerbside slot --------------------------------
            // A 1.3 s eased glide from the rail into the slot. Reverse-parking
            // properly would need a second graph and a lot of frames to look
            // right; from street level this reads as a car tucking in, and it
            // costs one branch on the handful of cars doing it. Marked bays in
            // the car parks get the full treatment instead (see _lotStep).
            if (ai.park) {
                ai.parkT += dt;
                const k = Math.min(1, ai.parkT / 1.3);
                const ease = k * k * (3 - 2 * k);
                v.x = ai.px0 + (ai.park.x - ai.px0) * ease;
                v.z = ai.pz0 + (ai.park.z - ai.pz0) * ease;
                v.heading = ai.ph0 + angleDelta(ai.ph0, ai.park.heading) * ease;
                v.speed = (1 - k) * 2.4;
                v.spin += (v.speed / 0.34) * dt;
                this._settleY(v, dt);
                if (k >= 1) {
                    ai.park.claimT = time + 8;      // genuinely occupied now
                    v.parked = true; v.driver = null; v.ai = null;
                    v.speed = 0; v.tempPark = true;
                    v.dropOff = true;               // the ped system lets the driver out
                    this.stats.parks++;
                }
                this.field.writeMatrix(v);
                return;
            }
            // Inside a car park there is no rail to ride, so the manoeuvre owns
            // the car outright until it is parked or back out on the street.
            if (ai.man && this._lotStep(v, dt, time, fx)) return;
            const e = ai.edge;
            if (!e) { this.field.remove(v); return; }
            // Fleeing drivers ignore the courtesies but not the geometry.
            const panic = ai.panicT > 0 && !ai.patrol;
            let want = panic ? e.speed * 1.4 : e.speed;
            const distEnd = e.length - ai.t;
            const toNode = this.map.nodes[e.to];
            const fwX = -Math.sin(v.heading), fwZ = -Math.cos(v.heading);
            const rgX = Math.cos(v.heading), rgZ = -Math.sin(v.heading);
            // --- hunting for somewhere to stop ------------------------------
            if (ai.wantPark) {
                const s = ai.wantPark;
                if (s.lot) {
                    // A marked bay: aim for the driveway mouth, then hand over
                    // to the lot manoeuvre once the car is on top of it.
                    const L = s.lot;
                    const md2 = dist2(v.x, v.z, L.entX, L.mouthZ);
                    if (dist2(v.x, v.z, s.x, s.z) > 320 * 320) ai.wantPark = null;
                    else if (md2 < 15 * 15 &&
                             (L.entX - v.x) * fwX + (L.mouthZ - v.z) * fwZ > -8) {
                        ai.wantPark = null;
                        ai.lot = L; ai.stall = s;
                        ai.man = 1; ai.mt = 0; ai.bT = 0;
                        ai.turn.on = false;
                        ai.lane = 0; ai.laneCur = 0; ai.overT = 0;
                        s.claimT = time + 60;
                        if (this._lotStep(v, dt, time, fx)) return;
                    } else if (md2 < 60 * 60) want = Math.min(want, 7);
                } else {
                    // Kerbside: commit once alongside it and pointing the same
                    // way (a slot's heading is its lane's, so matching headings
                    // means the car is on the correct side already).
                    const sd2 = dist2(v.x, v.z, s.x, s.z);
                    if (sd2 > 60 * 60) ai.wantPark = null;
                    else if (sd2 < 9 * 9 && Math.abs(angleDelta(v.heading, s.heading)) < 0.9) {
                        ai.wantPark = null;
                        ai.park = s; ai.parkT = 0;
                        ai.px0 = v.x; ai.pz0 = v.z; ai.ph0 = v.heading;
                    } else if (sd2 < 30 * 30) want = Math.min(want, 5.5);
                }
            }
            // Still straddling the junction behind: keep holding that box.
            if (ai.t < 9 && !this.map.nodes[e.from].hasLight) {
                const heldBox = this.claims.get(e.from);
                if (heldBox && heldBox.v === v) heldBox.exp = time + 0.45;
            }
            // Decide the turn early enough to slow down for it.
            if (!ai.nextEdge || ai.nextFor !== e) {
                ai.nextEdge = this._chooseNext(v, e);
                ai.nextFor = e;
                ai.leftWait = 0;
            }
            const nx = ai.nextEdge;
            const T = ai.turn;
            // Arm the corner arc once the whole curve is ahead of the car.
            if (nx && !T.on && distEnd < 15) this._makeFillet(v, e, nx);
            const turning = T.on && T.edge === e && ai.t >= T.t0;
            if (nx && distEnd < 26) {
                const dotN = nx.dirX * e.dirX + nx.dirZ * e.dirZ;
                if (dotN < 0.72) {
                    want = Math.min(want, dotN < 0.1 ? 5.0 : 7.5);
                    v.signal = (e.dirX * nx.dirZ - e.dirZ * nx.dirX) < 0 ? -1 : 1;
                } else v.signal = 0;
            } else if (!ai.overT) v.signal = 0;
            // --- signal ahead & intersection clearance ----------------------
            let held = false;
            const sigState = (toNode.hasLight && distEnd < 34)
                ? this.lights.stateFor(TrafficLightSystem.axisFor(e), time) : 'green';
            if (toNode.hasLight && distEnd < 32 && distEnd > 4.8 && !panic) {
                // Stop at the bar, which is clear of the crosswalk stripes.
                // If already past the bar (distEnd <= 4.8), continue through to clear the intersection.
                const bar = Math.max(0, distEnd - 6.5);
                if (sigState === 'red') {
                    want = Math.min(want, bar * 1.1);
                    held = true;
                } else if (sigState === 'yellow') {
                    // Dilemma zone: safe stopping distance check
                    const stopNeed = (v.speed * v.speed) / 10 + v.speed * 0.85;
                    if (bar > stopNeed) { want = Math.min(want, bar * 1.1); held = true; }
                }
            }
            // Universal "Don't Block the Box" rule: do not enter ANY intersection if exit lane is backed up
            if (distEnd < 14 && distEnd > 4.8 && nx && !panic && this._exitBlocked(v, nx)) {
                const bar = Math.max(0, distEnd - 6.5);
                want = Math.min(want, bar * 1.1);
                held = true;
            }
            // Pedestrian crosswalk safety: yield to pedestrians in the roadway ahead before proceeding
            if (distEnd < 12 && distEnd > 1.5 && !panic) {
                const pedsList = (this.peds && this.peds.renderer && this.peds.renderer.peds)
                    ? this.peds.renderer.peds
                    : (this.field && this.field.game && this.field.game.peds && this.field.game.peds.renderer ? this.field.game.peds.renderer.peds : null);
                if (pedsList) {
                    for (let pi = 0; pi < pedsList.length; pi++) {
                        const p = pedsList[pi];
                        if (p.state === 'dead') continue;
                        const pdx = p.x - v.x, pdz = p.z - v.z;
                        const pAhead = pdx * fwX + pdz * fwZ;
                        const pSide = Math.abs(pdx * rgX + pdz * rgZ);
                        if (pAhead > 0.4 && pAhead < 8.5 && pSide < 3.0) {
                            want = Math.min(want, 0);
                            held = true;
                            break;
                        }
                    }
                }
            }
            // An unprotected left has to be given away. Creeping into the box
            // and waiting for a gap is exactly what a driver does here.
            if (T.on && T.left && T.edge === e && distEnd < 14 && !panic) {
                ai.leftWait += dt;
                if (ai.leftWait < 8 && !this._leftGapOk(v, e, toNode)) {
                    want = Math.min(want, Math.max(0, (distEnd - 4.5) * 1.05));
                    held = true;
                }
            }
            // --- traffic ahead (stable queue spacing, no creeping) -----------
            let blocked = false;
            for (const o of this.field.vehicles) {
                if (o === v || o.gone) continue;
                const oai = o.ai;
                if (oai && oai.edge === e && oai.t > ai.t) {
                    const minBuf = (v.spec.L + o.spec.L) * 0.5 + 2.8;
                    const gap = oai.t - ai.t - minBuf;
                    if (gap < 8.5) {
                        if (gap <= 0.2) {
                            want = Math.min(want, 0);
                            blocked = true;
                        } else {
                            const leadSp = Math.max(0, o.speed);
                            want = Math.min(want, leadSp * 0.85 + gap * 0.85);
                            if (gap < 2.5) blocked = true;
                        }
                    }
                } else if (oai && oai.edge && oai.edge.from === e.to && ai.t > e.length - 12) {
                    const minBuf = (v.spec.L + o.spec.L) * 0.5 + 2.8;
                    const gap = (e.length - ai.t) + oai.t - minBuf;
                    if (gap < 8.5) {
                        if (gap <= 0.2) {
                            want = Math.min(want, 0);
                            blocked = true;
                        } else {
                            const leadSp = Math.max(0, o.speed);
                            want = Math.min(want, leadSp * 0.85 + gap * 0.85);
                            if (gap < 2.5) blocked = true;
                        }
                    }
                } else {
                    const ox = o.x - v.x, oz = o.z - v.z;
                    const fd = ox * fwX + oz * fwZ - (v.spec.L + o.spec.L) * 0.5;
                    const latW = (v.spec.W + o.spec.W) * 0.5 + 0.6;
                    if (fd > -1.0 && fd < 12.0 && Math.abs(ox * rgX + oz * rgZ) < latW) {
                        if (fd <= 0.4) {
                            want = Math.min(want, 0);
                            blocked = true;
                        } else {
                            want = Math.min(want, Math.max(0, fd * 1.0));
                            if (fd < 3.0) blocked = true;
                        }
                    }
                }
            }
            // Unsignalized junction: take turns rather than trusting to luck.
            let yielding = false;
            if (!toNode.hasLight && !held && ai.stuck < 5 && !panic) {
                if (!this._claimJunction(v, e, e.to, distEnd, time)) {
                    want = Math.min(want, Math.max(0, (distEnd - 5) * 1.1));
                    yielding = true;
                }
            }
            // Pedestrian / player avoidance (front cone) — the ped system
            // writes v.ai.brakeFor when someone is in the way.
            if (ai.brakeFor > 0) { want = Math.min(want, 0); ai.brakeFor -= dt; }
            // --- patience ----------------------------------------------------
            // Waiting for a red is waiting for a reason, and nobody honks at
            // that. Sitting behind something that simply is not moving is a
            // different matter.
            const excusable = held || yielding || sigState !== 'green';
            if (v.speed < 0.7 && want < 1 && !excusable) {
                ai.blockedTimer += dt;
                if (ai.blockedTimer > 3.2 && ai.hornT <= 0) {
                    ai.hornT = 7.0 + Math.random() * 5.0;
                    this._honk(v, fx);
                }
            } else if (ai.blockedTimer > 0) {
                ai.blockedTimer = Math.max(0, ai.blockedTimer - dt * 2.5);
            }
            // Nose to nose in a narrow street: somebody has to back off, and it
            // is whoever has the weaker claim to the road.
            if (ai.blockedTimer > 4.5 && ai.revT <= 0 && this._unwedge(v, e, fwX, fwZ)) {
                ai.blockedTimer = 0;
            }
            if (ai.revT > 0) {
                ai.revT -= dt;
                v.speed = Math.max(-2.6, v.speed - 6 * dt);
                v.heading += 0.24 * dt * ai.revSgn;      // ease towards the kerb
                ai.t = Math.max(0, ai.t + v.speed * dt);
                v.x += fwX * v.speed * dt;
                v.z += fwZ * v.speed * dt;
                v.spin += (v.speed / 0.34) * dt;
                v.braking = true;
                this._settleY(v, dt);
                this.field.writeMatrix(v);
                return;
            }
            this._overtake(v, e, dt, blocked, panic);
            // Gridlock watchdog: a car that has been deferring to someone else's
            // claim for long enough stops deferring (the `ai.stuck` gate above),
            // so two cars each waiting on the other can never wait forever.
            // Only junction deference counts towards it: a red light and a queue
            // ahead are both cars waiting for a good reason, and folding those in
            // would let a car leave a red light with its yielding switched off.
            // It deliberately does NOT override the car-ahead or pedestrian
            // brake — creeping through those is how a jam becomes a pile-up.
            if (yielding && v.speed < 1) {
                ai.stuck = (ai.stuck || 0) + dt;
                if (ai.stuck > 5) this.stats.gridlockBreaks++;
            } else if (ai.stuck) ai.stuck = Math.max(0, ai.stuck - dt * 2);

            // Anti-gridlock watchdog: if a vehicle is completely immobilized for > 18s and not at a legitimate red light,
            // resolve the deadlock proactively so city traffic never permanently freezes.
            const atValidRed = held && toNode && toNode.hasLight && sigState === 'red' && distEnd > 4.8 && distEnd < 30.0;
            if (Math.abs(v.speed) < 0.25 && !v.parked && !atValidRed) {
                ai.jammedTimer = (ai.jammedTimer || 0) + dt;
                if (ai.jammedTimer > 5.5 && ai.revT <= 0) {
                    this._unwedge(v, e, fwX, fwZ);
                }
                if (ai.jammedTimer > 18.0) {
                    if (dist2(v.x, v.z, this._px, this._pz) > 22 * 22) {
                        this.field.remove(v);
                        this.stats.gridlockBreaks++;
                        return;
                    }
                }
            } else if (ai.jammedTimer > 0) {
                ai.jammedTimer = Math.max(0, ai.jammedTimer - dt * 2.0);
            }
            // Accelerate / brake toward want. AI uses each vehicle's real
            // launch/brake figures so traffic pulls away like its class —
            // buses lumber, cruisers snap — instead of one arcade rate.
            v.braking = (v.speed > 0.4 && want < v.speed - 0.2);
            if (want > v.speed) {
                const pull = v.spec && v.spec.accel ? clamp(v.spec.accel * 0.55, 1.6, 6.0) : 4;
                v.speed = Math.min(want, v.speed + (panic ? pull * 1.5 : pull) * dt);
            } else {
                const stop = v.spec && v.spec.brake ? clamp(v.spec.brake * 0.8, 4, 10) : 8;
                v.speed = Math.max(want, v.speed - stop * dt);
            }
            // Panic stops with real bite screech: same audible rule as the
            // player's car (hard decel at speed = tires losing traction).
            if (v.braking && v.speed > 11 && fx && fx.skid) {
                const nowMs = performance.now();
                if (!v._skidSfxT || nowMs - v._skidSfxT > 620) {
                    v._skidSfxT = nowMs;
                    fx.skid(v.x, v.z);
                }
            }
            // Advance along the rail. While cutting a corner the arc and the L
            // it replaces are different lengths, so rail progress is scaled by
            // `pace` or the car would visibly change speed through every turn.
            ai.t += v.speed * dt * (turning ? T.pace : 1);
            if (ai.t >= e.length) {
                const best = nx || this._chooseNext(v, e);
                if (!best) { this.field.remove(v); return; }
                ai.t -= e.length;
                ai.edge = best;
                if (ai.route && ai.route[ai.ri] === best) ai.ri++;
                ai.nextEdge = null; ai.nextFor = null;
                ai.leftWait = 0;
                // A lateral offset is expressed along the old edge's left
                // vector, so it cannot survive the swap.
                ai.lane = 0; ai.overT = 0;
            }
            const e2 = ai.edge;
            let tx, tz, targetHeading;
            // Progress through the arc spans the tail of one edge and the head
            // of the next, so it is measured in metres across both.
            let q = -1;
            if (T.on) {
                if (T.next === e2 && T.edge) q = ((T.edge.length - T.t0) + ai.t) / T.total;
                else if (T.edge === e2) q = (ai.t - T.t0) / T.total;
                else { T.on = false; T.edge = null; T.next = null; }
            }
            if (q >= 0 && q <= 1) {
                const u = q, iu = 1 - u;
                tx = iu * iu * T.p0x + 2 * iu * u * T.p1x + u * u * T.p2x;
                tz = iu * iu * T.p0z + 2 * iu * u * T.p1z + u * u * T.p2z;
                const dqx = 2 * iu * (T.p1x - T.p0x) + 2 * u * (T.p2x - T.p1x);
                const dqz = 2 * iu * (T.p1z - T.p0z) + 2 * u * (T.p2z - T.p1z);
                targetHeading = Math.atan2(-dqx, -dqz);
            } else {
                if (q > 1) { T.on = false; T.edge = null; T.next = null; }
                const k = clamp(ai.t / e2.length, 0, 1);
                tx = e2.ax + (e2.bx - e2.ax) * k;
                tz = e2.az + (e2.bz - e2.az) * k;
                targetHeading = Math.atan2(-e2.dirX, -e2.dirZ);
                if (ai.laneCur || ai.lane) {
                    // Swerving out and back: the rail target slides sideways and
                    // the heading has to lead it, or the car crabs.
                    const lx = e2.dirZ, lz = -e2.dirX;
                    tx += lx * ai.laneCur; tz += lz * ai.laneCur;
                    const rate = (ai.lane - ai.laneCur) * 2.2 / Math.max(3, v.speed);
                    targetHeading = Math.atan2(-(e2.dirX + lx * rate), -(e2.dirZ + lz * rate));
                }
            }
            // Smooth the pose (lateral blend keeps turns round).
            const da = angleDelta(v.heading, targetHeading);
            const blend = clamp(v.speed * dt * 2.2, 0.06, 0.5);
            v.x = lerp(v.x, tx, blend);
            v.z = lerp(v.z, tz, blend);
            v.heading += da * clamp(dt * 6, 0, 1);
            v.steer = clamp(da * 2.2, -0.6, 0.6);
            v.spin += (v.speed / 0.34) * dt;
            this._settleY(v, dt);
            this.field.writeMatrix(v);
        }

        /**
         * Geometry for one corner. Two lane rails meet at a node in a hard L,
         * so a car that simply swaps rails pivots on the spot. This builds the
         * quadratic Bezier that cuts the corner: P0 back along the incoming
         * rail, P1 at the intersection of the two rail lines, P2 forward along
         * the outgoing one. Because P1 is the intersection, the curve leaves and
         * rejoins each rail exactly tangent to it — no kink at either end.
         *
         * `pace` is rail-parameter per metre driven. The L and the arc that
         * replaces it are different lengths, and without the correction a car
         * would slow down or speed up through every turn.
         */
        _makeFillet(v, e, nx) {
            const den = e.dirX * nx.dirZ - e.dirZ * nx.dirX;
            const dot = e.dirX * nx.dirX + e.dirZ * nx.dirZ;
            if (dot > 0.985 || Math.abs(den) < 1e-4) return false;   // straight on
            // Intersection of the line through (e.bx,e.bz) along e with the
            // line through (nx.ax,nx.az) along nx.
            const wx = nx.ax - e.bx, wz = nx.az - e.bz;
            const a = (wx * nx.dirZ - wz * nx.dirX) / den;
            const ix = e.bx + e.dirX * a, iz = e.bz + e.dirZ * a;
            const u = (ix - nx.ax) * nx.dirX + (iz - nx.az) * nx.dirZ;
            // Tight enough to read as a city block, loose enough that a bus
            // does not cut the kerb.
            const R = dot < 0.1 ? 7.0 : 4.5;
            const t0 = clamp(e.length + a - R, 0, e.length);
            const t1 = clamp(u + R, 0.5, nx.length);
            const total = (e.length - t0) + t1;
            if (total < 1.2) return false;
            const T = v.ai.turn;
            T.p0x = e.ax + e.dirX * t0; T.p0z = e.az + e.dirZ * t0;
            T.p1x = ix; T.p1z = iz;
            T.p2x = nx.ax + nx.dirX * t1; T.p2z = nx.az + nx.dirZ * t1;
            const l1 = Math.hypot(T.p1x - T.p0x, T.p1z - T.p0z);
            const l2 = Math.hypot(T.p2x - T.p1x, T.p2z - T.p1z);
            T.t0 = t0; T.t1 = t1; T.total = total;
            T.pace = clamp(total / Math.max(1, (l1 + l2) * 0.92), 0.15, 3.2);
            // Only a real turn counts as a left. Two rails on a shallow bend
            // such as Broadway also cross on the left, and a car easing through
            // a fifteen degree kink must not sit there waiting for a gap.
            T.left = den < 0 && dot < 0.72;
            T.edge = e; T.next = nx; T.on = true;
            return true;
        }

        /** Is the far side of this junction plugged with stopped traffic? */
        _exitBlocked(v, nx) {
            if (!nx) return false;
            const reqSpace = (v.spec ? v.spec.L : 4.8) + 4.0;
            for (const o of this.field.vehicles) {
                if (o === v || o.gone || o.parked) continue;
                if (Math.abs(o.speed) > 1.8) continue;
                const oai = o.ai;
                if (oai && oai.edge === nx) {
                    if (oai.t < reqSpace + 4.0) return true;
                } else {
                    const ox = o.x - nx.ax, oz = o.z - nx.az;
                    const t = ox * nx.dirX + oz * nx.dirZ;
                    if (t >= -2.0 && t < reqSpace + 4.0) {
                        const lat = Math.abs(ox * (-nx.dirZ) + oz * nx.dirX);
                        if (lat < 3.2) return true;
                    }
                }
            }
            return false;
        }

        /**
         * A permissive left has to be given away: cross only when nothing
         * oncoming will reach the box first. Oncoming means a car whose nose
         * points back down this rail, which on this grid is the other side of
         * the same street.
         */
        _leftGapOk(v, e, toNode) {
            for (const o of this.field.vehicles) {
                if (o === v || o.gone || o.parked || o.dead) continue;
                const sp = Math.abs(o.speed);
                if (sp < 1.2) continue;
                const ofx = -Math.sin(o.heading), ofz = -Math.cos(o.heading);
                if (ofx * e.dirX + ofz * e.dirZ > -0.6) continue;      // not oncoming
                const dx = toNode.x - o.x, dz = toNode.z - o.z;
                const along = dx * ofx + dz * ofz;
                if (along < -3) continue;                              // already through
                if (Math.abs(dx * ofz - dz * ofx) > 9) continue;        // another street
                if (along / sp < 3.2) return false;                     // it gets there first
            }
            return true;
        }

        /**
         * One horn at a time. Every blocked car honking on its own schedule
         * would be both deafening and a torrent of timers, so the system keeps a
         * single short cooldown and only cars near enough to be heard spend it.
         */
        _honk(v, fx) {
            const hornFn = (fx && (fx.trafficHorn || fx.horn));
            if (!hornFn || this._hornCd > 0) return;
            // Only cars within 38 meters of the player can honk
            if (dist2(v.x, v.z, this._px, this._pz) > 38 * 38) return;
            this._hornCd = 3.8;
            hornFn(v.x, v.z);
        }

        /**
         * Sitting behind something that will not move, on a road with room
         * beside it, a driver eventually goes around. The offset is damped
         * rather than assigned, so the car draws an S out and back instead of
         * stepping sideways, and the lane it is moving into is probed 12 m ahead
         * before anything is committed.
         */
        _overtake(v, e, dt, blocked, panic) {
            const ai = v.ai;
            if (ai.overT > 0) {
                ai.overT -= dt;
                if (ai.overT <= 0) { ai.lane = 0; v.signal = 0; }
            } else if (blocked && !ai.man && !ai.park && !ai.wantPark) {
                const distEnd = e.length - ai.t;
                // STRICT TRAFFIC RULE: NEVER overtake near intersections or stop lines!
                if (distEnd < 26 || ai.t < 12) return;
                // NEVER overtake if stopped behind a vehicle waiting at a red light or pedestrian crossing
                if (v.speed < 0.3 && (v.braking || ai.brakeFor > 0)) return;
                // Only overtake on long straightaways when blocked for > 4.0 seconds
                if (ai.blockedTimer > (panic ? 1.0 : 4.0) && (e.seg.major || !e.oneway) && e.length > 35) {
                    const off = e.seg.major ? 2.8 : 2.5;
                    const lx = e.dirZ, lz = -e.dirX;
                    const px = v.x + lx * off, pz = v.z + lz * off;
                    let clear = true;
                    for (const o of this.field.vehicles) {
                        if (o === v || o.gone) continue;
                        const ox = o.x - px, oz = o.z - pz;
                        const fd = ox * e.dirX + oz * e.dirZ;
                        if (fd < -8 || fd > 40) continue; // check ahead 40 meters
                        if (Math.abs(ox * lx + oz * lz) > 2.8) continue;
                        clear = false; break;
                    }
                    if (clear) {
                        ai.lane = off;
                        ai.overT = 4.0;
                        v.signal = -1;
                        this.stats.overtakes++;
                    }
                }
            }
            ai.laneCur = damp(ai.laneCur, ai.lane, 2.2, dt);
        }

        /**
         * Two cars nose to nose where neither can pass. Priority goes to the
         * bigger vehicle on the more important road, with the index as a
         * tie-break so the comparison can never call it both ways.
         */
        _unwedge(v, e, fwX, fwZ) {
            const mine = (e.seg.major ? 100 : 0) + v.spec.L * 4 - v.idx * 0.01;
            for (const o of this.field.vehicles) {
                if (o === v || o.gone || o.parked) continue;
                if (dist2(v.x, v.z, o.x, o.z) > 7.5 * 7.5) continue;
                const ofx = -Math.sin(o.heading), ofz = -Math.cos(o.heading);
                if (ofx * fwX + ofz * fwZ > -0.7) continue;        // not head-on
                const oe = o.ai && o.ai.edge;
                const theirs = ((oe && oe.seg.major) ? 100 : 0) + o.spec.L * 4 - o.idx * 0.01;
                if (mine >= theirs) return false;                   // they give way
                v.ai.revT = 1.8 + Math.random() * 0.8;              // 4-6 m back
                v.ai.revSgn = (o.x - v.x) * fwZ - (o.z - v.z) * fwX > 0 ? 1 : -1;
                this.stats.unwedges++;
                return true;
            }
            return false;
        }

        /**
         * Gunfire, an explosion, a siren going by: everyone close enough drives
         * like it for a few seconds.
         */
        alert(x, z, radius) {
            const r2 = radius * radius;
            for (const v of this.field.vehicles) {
                const ai = v.ai;
                if (!ai || ai.patrol || v.parked || v.dead) continue;
                if (dist2(v.x, v.z, x, z) > r2) continue;
                if (ai.panicT <= 0) this.stats.panics++;
                ai.panicT = Math.max(ai.panicT, 4.5 + Math.random() * 3.5);
                ai.blockedTimer = 0;
            }
        }

        _settleY(v, dt) {
            const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
            const wb = v.wheelBase || 1.4;
            const gFront = this.physics.groundAt(v.x + fx * wb, v.z + fz * wb, v.y + 0.8, 1.4, this._q);
            const gRear  = this.physics.groundAt(v.x - fx * wb, v.z - fz * wb, v.y + 0.8, 1.4, this._q);
            v.y = damp(v.y, (gFront + gRear) * 0.5, 18, dt);
            v.pitch = damp(v.pitch || 0, clamp(Math.atan2(gFront - gRear, 2 * wb), -0.65, 0.65), 14, dt);
        }

        _reached(v, x, z, r) { return dist2(v.x, v.z, x, z) < r * r; }

        /**
         * Free-form driving towards a point, used everywhere inside a car park
         * where there is no rail to ride. A car cannot pivot, so the heading
         * turns at a bounded rate and the body always travels along its own
         * nose — that is what keeps the motion continuous rather than sliding.
         */
        _driveFree(v, tx, tz, target, dt, reverse) {
            const dx = tx - v.x, dz = tz - v.z;
            const d = Math.hypot(dx, dz) || 1e-6;
            let th = Math.atan2(-dx, -dz);
            if (reverse) th += Math.PI;
            const da = angleDelta(v.heading, th);
            const rate = clamp(1.35 + Math.abs(v.speed) * 0.12, 1.0, 2.1);
            v.heading += clamp(da, -rate * dt, rate * dt);
            v.steer = clamp(da * 1.8, -0.62, 0.62);
            let want = Math.min(target, 1.1 + d * 0.75);
            if (Math.abs(da) > 0.8) want = Math.min(want, 2.0);
            if (reverse) {
                want = -Math.min(2.6, Math.max(0, want));
                v.speed = Math.max(want, v.speed - 6 * dt);
            } else if (want > v.speed) {
                v.speed = Math.min(want, v.speed + 5 * dt);
            } else {
                v.speed = Math.max(want, v.speed - 10 * dt);
            }
            v.braking = !reverse && want < v.speed - 0.2;
            v.x += -Math.sin(v.heading) * v.speed * dt;
            v.z += -Math.cos(v.heading) * v.speed * dt;
            v.spin += (v.speed / 0.34) * dt;
        }

        /** Where on the lot lane the swing into a bay begins. */
        _armApron(v, st) {
            const ai = v.ai;
            ai.b0x = st.x + ((v.x - st.x) >= 0 ? 3.9 : -3.9);
            ai.b0z = st.laneZ;
        }

        /** Nothing on the street bearing down on the driveway mouth. */
        _streetClear(v, L) {
            for (const o of this.field.vehicles) {
                if (o === v || o.gone || o.parked) continue;
                const sp = Math.abs(o.speed);
                if (sp < 1.5) continue;
                if (dist2(o.x, o.z, L.exitX, L.mouthZ) > 26 * 26) continue;
                const ofx = -Math.sin(o.heading), ofz = -Math.cos(o.heading);
                const dx = L.exitX - o.x, dz = L.mouthZ - o.z;
                const along = dx * ofx + dz * ofz;
                if (along < 0) continue;
                // It has to actually come past the mouth, not merely be heading
                // in its general direction two lanes over.
                const lat = Math.abs(dx * Math.cos(o.heading) + dz * -Math.sin(o.heading));
                if (lat > 4.5) continue;
                if (along / sp < 2.6) return false;
            }
            return true;
        }

        /**
         * Everything that happens inside a car park: the approach to the mouth,
         * the barrier, the lot lanes, the swing into the bay, the driver getting
         * out, the reverse back out and the merge onto the street. One phase
         * counter on the driver, so the whole lifecycle costs a switch.
         *
         *   1 mouth  2 in-gate + entry lane  3 cross to the far lane
         *   4 lane run to the apron  5 Bezier swing into the bay  6 park
         *   7 reverse out  71 the beat before Drive  8 lane run to the exit
         *   9 exit lane + gate + look for traffic  10 back on the rails
         *
         * Returns true while it owns the car.
         */
        _lotStep(v, dt, time, fx) {
            const ai = v.ai, L = ai.lot, st = ai.stall;
            if (!L || (!st && ai.man < 10)) { ai.man = 0; ai.lot = null; return false; }
            ai.mt += dt;
            let tx = 0, tz = 0, target = 3.2, arrive = 1.8, rev = false;
            switch (ai.man) {
                case 1:                                  // line up on the driveway
                    tx = L.entX; tz = L.mouthZ; target = 4.5; arrive = 2.6;
                    v.signal = -1;
                    if (this._reached(v, tx, tz, arrive)) { ai.man = 2; ai.mt = 0; }
                    break;
                case 2:                                  // through the barrier
                    tx = L.entX; tz = L.southLaneZ; target = 3.4; arrive = 1.7;
                    v.signal = 0;
                    // Creep up to the arm and wait for it. The sensor sees the
                    // car because it is pointed the right way.
                    if (L.inGate && L.inGate.k < 0.72 && v.z > L.gateZ + 1.0) {
                        target = Math.min(target, Math.max(0, (v.z - L.gateZ - 2.4) * 0.9));
                    }
                    if (this._reached(v, tx, tz, arrive)) {
                        ai.mt = 0;
                        if (st.laneZ === L.southLaneZ) { ai.man = 4; this._armApron(v, st); }
                        else ai.man = 3;
                    }
                    break;
                case 3:                                  // up the middle to the north lane
                    tx = L.entX; tz = st.laneZ; target = 3.2; arrive = 1.6;
                    if (this._reached(v, tx, tz, arrive)) {
                        ai.man = 4; ai.mt = 0; this._armApron(v, st);
                    }
                    break;
                case 4:                                  // along the lane to the apron
                    tx = ai.b0x; tz = ai.b0z; target = 2.9; arrive = 1.3;
                    if (this._reached(v, tx, tz, arrive)) {
                        // P0 is where the car actually is, so the curve starts
                        // exactly underneath it: no step, no snap.
                        ai.b0x = v.x; ai.b0z = v.z;
                        ai.b1x = st.x; ai.b1z = st.laneZ;
                        ai.b2x = st.x; ai.b2z = st.z;
                        ai.bLen = Math.max(2, (Math.hypot(ai.b1x - ai.b0x, ai.b1z - ai.b0z) +
                                               Math.hypot(ai.b2x - ai.b1x, ai.b2z - ai.b1z)) * 0.92);
                        ai.bT = 0; ai.man = 5; ai.mt = 0;
                        v.signal = ai.b1x < ai.b0x ? -1 : 1;
                    }
                    break;
                case 5: {                                // the swing into the bay
                    v.speed = damp(v.speed, lerp(2.6, 0.8, ai.bT), 5, dt);
                    ai.bT += (v.speed * dt) / ai.bLen;
                    const u = Math.min(1, ai.bT), iu = 1 - u;
                    v.x = iu * iu * ai.b0x + 2 * iu * u * ai.b1x + u * u * ai.b2x;
                    v.z = iu * iu * ai.b0z + 2 * iu * u * ai.b1z + u * u * ai.b2z;
                    const dqx = 2 * iu * (ai.b1x - ai.b0x) + 2 * u * (ai.b2x - ai.b1x);
                    const dqz = 2 * iu * (ai.b1z - ai.b0z) + 2 * u * (ai.b2z - ai.b1z);
                    const th = Math.atan2(-dqx, -dqz);
                    const da = angleDelta(v.heading, th);
                    v.heading += da * clamp(dt * 7, 0, 1);
                    v.steer = clamp(da * 2.6, -0.62, 0.62);
                    v.spin += (v.speed / 0.34) * dt;
                    v.braking = true;
                    if (ai.bT >= 1) { ai.man = 6; ai.mt = 0; }
                    this._settleY(v, dt);
                    this.field.writeMatrix(v);
                    return true;
                }
                case 6:                                  // engine off, driver out
                    v.speed = Math.max(0, v.speed - 4 * dt);
                    v.braking = true;
                    v.x = damp(v.x, st.x, 6, dt);
                    v.z = damp(v.z, st.z, 6, dt);
                    v.heading += angleDelta(v.heading, st.heading) * clamp(dt * 5, 0, 1);
                    this._settleY(v, dt);
                    this.field.writeMatrix(v);
                    if (ai.mt > 0.9) {
                        st.claimT = time + 8;
                        v.parked = true; v.driver = null; v.ai = null;
                        v.speed = 0; v.braking = false; v.signal = 0;
                        v.tempPark = true;
                        v.dropOff = true;                // the ped system lets them out
                        v.lotSpot = st;                  // and remembers the bay
                        this.stats.parks++;
                    }
                    return true;
                case 7: {                                // reverse out of the bay
                    v.speed = Math.max(-2.4, v.speed - 5 * dt);
                    // Counter-steer on the way back so the nose comes round
                    // towards the way out and no second shuffle is needed.
                    const laneH = L.exitX >= st.x ? -Math.PI / 2 : Math.PI / 2;
                    v.heading += angleDelta(v.heading, laneH) * clamp(dt * 0.55, 0, 1);
                    v.x += -Math.sin(v.heading) * v.speed * dt;
                    v.z += -Math.cos(v.heading) * v.speed * dt;
                    v.spin += (v.speed / 0.34) * dt;
                    ai.bT += Math.abs(v.speed) * dt;
                    v.signal = L.exitX >= st.x ? 1 : -1;
                    if (ai.bT >= v.spec.L * 1.1) { ai.man = 71; ai.mt = 0; }
                    this._settleY(v, dt);
                    this.field.writeMatrix(v);
                    return true;
                }
                case 71:                                 // stopped, shifting to Drive
                    v.speed = damp(v.speed, 0, 9, dt);
                    v.braking = true;
                    this._settleY(v, dt);
                    this.field.writeMatrix(v);
                    if (ai.mt > 0.45) { v.speed = 0; ai.man = 8; ai.mt = 0; }
                    return true;
                case 8:                                  // along the lane to the exit
                    tx = L.exitX; tz = st.laneZ; target = 3.0; arrive = 2.2;
                    if (this._reached(v, tx, tz, arrive)) { ai.man = 9; ai.mt = 0; }
                    break;
                case 9:                                  // out through the barrier
                    tx = L.exitX; tz = L.mouthZ + 2.0; target = 3.2; arrive = 2.6;
                    v.signal = 1;
                    if (L.outGate && L.outGate.k < 0.72 && v.z < L.gateZ - 1.0) {
                        target = Math.min(target, Math.max(0, (L.gateZ - 2.4 - v.z) * 0.9));
                    }
                    // Nose out, then look before joining the street.
                    if (v.z > L.z2 - 4 && v.z < L.mouthZ && !this._streetClear(v, L)) target = 0;
                    if (this._reached(v, tx, tz, arrive)) { ai.man = 10; ai.mt = 0; }
                    break;
                case 10: {                               // blend back onto a rail
                    const hit = this.nearestEdge(v.x, v.z, v.heading);
                    if (hit) {
                        ai.edge = hit.edge; ai.t = hit.t;
                        ai.man = 0; ai.mt = 0; ai.bT = 0;
                        ai.lot = null; ai.stall = null;
                        ai.nextEdge = null; ai.nextFor = null;
                        ai.turn.on = false;
                        v.signal = 0;
                        return false;                    // the rails take it now
                    }
                    if (ai.mt > 8) { this.field.remove(v); return true; }
                    tx = v.x - Math.sin(v.heading) * 10;
                    tz = v.z - Math.cos(v.heading) * 10;
                    target = 2.6; arrive = 0.5;
                    break;
                }
                default:
                    ai.man = 0; ai.lot = null; ai.stall = null;
                    return false;
            }
            // Anything in the way: a car on the lane, one nosing out of a bay,
            // the player wandering across the lot.
            const tsg = rev ? -1 : 1;
            const fwX = -Math.sin(v.heading) * tsg, fwZ = -Math.cos(v.heading) * tsg;
            const rgX = Math.cos(v.heading), rgZ = -Math.sin(v.heading);
            for (const o of this.field.vehicles) {
                if (o === v || o.gone) continue;
                const ox = o.x - v.x, oz = o.z - v.z;
                const fd = ox * fwX + oz * fwZ - (v.spec.L + o.spec.L) * 0.5;
                if (fd < -0.5 || fd > 7) continue;
                if (Math.abs(ox * rgX + oz * rgZ) > 2.1) continue;
                target = Math.min(target, Math.max(0, fd * 0.9));
            }
            if (ai.brakeFor > 0) { target = 0; ai.brakeFor -= dt; }
            this._driveFree(v, tx, tz, target, dt, rev);
            this._settleY(v, dt);
            this.field.writeMatrix(v);
            // Wedged for a very long time in one phase: give the car back to the
            // street rather than leaving it stuck in a lot for ever.
            if (ai.mt > 45 && ai.man !== 10) { ai.man = 10; ai.mt = 0; }
            return true;
        }

        /** Traffic cars react to nearby horn honks */
        onHorn(x, z, radius = 25) {
            const r2 = radius * radius;
            for (const v of this.field.vehicles) {
                if (!v.ai || v.parked) continue;
                if (dist2(v.x, v.z, x, z) < r2) {
                    if (v.ai.stuck > 0) v.ai.stuck = Math.max(0, v.ai.stuck - 1.5);
                }
            }
        }
    }
