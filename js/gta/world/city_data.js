    // ===========================================================================
    // CITY — map derivation: roads, nodes, edges, blocks, sidewalk graph
    // ===========================================================================
    /**
     * Axis-aligned corridor rects for every road segment that could touch
     * `rect`, expanded by `margin`. Diagonals contribute one tight band across
     * the rect's z-span rather than a stair-step stack, so subtracting them
     * splits a block cleanly in two instead of shattering it.
     * `bk` selects the Manhattan (false) or Brooklyn (true) road set; bridges
     * belong to both.
     */
    function roadObstacles(segments, rect, bk, margin, out) {
        for (const seg of segments) {
            if (seg.bk !== bk && !seg.bridge) continue;
            const hw = seg.width / 2 + margin;
            if (seg.dir === 'ns') {
                if (seg.bz + margin < rect.z1 || seg.az - margin > rect.z2) continue;
                if (seg.x + hw <= rect.x1 || seg.x - hw >= rect.x2) continue;
                out.push({ x1: seg.x - hw, x2: seg.x + hw, z1: seg.az - margin, z2: seg.bz + margin });
            } else if (seg.dir === 'ew') {
                if (seg.z + hw <= rect.z1 || seg.z - hw >= rect.z2) continue;
                if (seg.bx + margin < rect.x1 || seg.ax - margin > rect.x2) continue;
                out.push({ x1: seg.ax - margin, x2: seg.bx + margin, z1: seg.z - hw, z2: seg.z + hw });
            } else {
                const zlo = Math.min(seg.az, seg.bz), zhi = Math.max(seg.az, seg.bz);
                const a = Math.max(zlo, rect.z1 - margin), b = Math.min(zhi, rect.z2 + margin);
                if (b < a) continue;
                const dz = (seg.bz - seg.az) || 1;
                const xa = seg.ax + (seg.bx - seg.ax) * ((a - seg.az) / dz);
                const xb = seg.ax + (seg.bx - seg.ax) * ((b - seg.az) / dz);
                const x1 = Math.min(xa, xb) - hw, x2 = Math.max(xa, xb) + hw;
                if (x2 <= rect.x1 || x1 >= rect.x2) continue;
                out.push({ x1, x2, z1: a - margin, z2: b + margin });
            }
        }
        return out;
    }

    /** True when a footprint keeps entirely off the asphalt. */
    function rectClearOfRoads(segments, x0, z0, x1, z1, bk, clearance) {
        const rect = { x1: Math.min(x0, x1), z1: Math.min(z0, z1), x2: Math.max(x0, x1), z2: Math.max(z0, z1) };
        return roadObstacles(segments, rect, bk, clearance === undefined ? 0.4 : clearance, []).length === 0;
    }

    /** Street/avenue half width helper (Houston and Canal are wider). */
    function streetWidth(name, cls, z) {
        if (name === 'Houston St') return HOUSTON_W;
        if (name === 'Canal St') return CANAL_W;
        return cls === 'M' ? 13 : 9;
    }

    /** Sidewalk width kept between a road edge and the nearest buildable lot. */
    const BLOCK_MARGIN = 4.5;
    /** Blocks (and carved fragments) thinner than this in either axis are dropped. */
    const BLOCK_MIN = 14;

    /** Node offset from the lot line — peds walk down the middle of the sidewalk. */
    const SW_INSET = 1.7;
    /** Ring-node spacing along a long block frontage. */
    const SW_SPACING = 24;
    /**
     * How much foot traffic a district's ground floors pull. Peds pick their
     * destinations weighted by this, so shopping streets and market blocks stay
     * busy while residential side streets stay quiet — the same crowd, unevenly
     * distributed, which is what makes a city read as alive.
     */
    const SW_POI_WEIGHT = {
        setback: 5, castiron: 4, tenement: 4, deco: 3,
        midrise: 2, glass: 2, park: 3,
        limestone: 1, prewar: 1, brownstone: 1, rowhouse: 1, warehouse: 1,
    };

    /**
     * Axis-aligned rect difference: push the parts of `a` not covered by `b`
     * into `out`, discarding pieces thinner than `min` in either axis. Splits
     * into a north strip, a south strip, and the west/east remainders of the
     * overlapping band — at most four pieces, never overlapping.
     */
    function rectSubtract(a, b, out, min) {
        if (b.x2 <= a.x1 || b.x1 >= a.x2 || b.z2 <= a.z1 || b.z1 >= a.z2) { out.push(a); return; }
        const keep = (x1, z1, x2, z2) => {
            if (x2 - x1 >= min && z2 - z1 >= min) out.push({ x1, z1, x2, z2 });
        };
        keep(a.x1, a.z1, a.x2, Math.min(a.z2, b.z1));           // north of b
        keep(a.x1, Math.max(a.z1, b.z2), a.x2, a.z2);           // south of b
        const mz1 = Math.max(a.z1, b.z1), mz2 = Math.min(a.z2, b.z2);
        keep(a.x1, mz1, Math.min(a.x2, b.x1), mz2);             // west of b
        keep(Math.max(a.x1, b.x2), mz1, a.x2, mz2);             // east of b
    }

    /**
     * ManhattanMap derives every drivable road segment, lane-graph node and
     * edge, fillable block, and sidewalk node from the MAP data tables.
     */
    class ManhattanMap {
        constructor() {
            this.segments = [];   // drivable road segments (see derive)
            this.nodes = [];      // lane-graph nodes at intersections
            this.nodeByIdx = new Map();
            this.edges = [];      // directed lane edges
            this.blocks = [];     // fillable block rects {x1,z1,x2,z2,district,grammar,bk}
            this.sidewalkNodes = [];// {x,z,nbrs:[]}
            this.lights = [];     // signalized {x,z,nsName}
            this.parkedSpots = [];// parked-car spawn spots {x,z,heading}
            this.parkingLots = [];// registered car parkings {id, name, x1, z1, x2, z2, stalls}
        }

        derive() {
            this._deriveAvenues();
            this._deriveStreets();
            this._deriveBroadway();
            this._deriveBrooklyn();
            this._deriveParadise();
            this._deriveQueens();
            this._deriveViceShores();
            this._deriveGovernors();
            this._deriveBridges();
            this._deriveNodesAndEdges();
            this._deriveBlocks();
            this._deriveSidewalkGraph();
            this._deriveParkedSpots();
        }

        // ---- road segments --------------------------------------------------
        _deriveAvenues() {
            for (const [name, x, width, lanes, oneway] of AVENUES) {
                const land = LandMask.zRangeAtX(x);
                if (!land) continue;
                let zSpans;
                if (name === 'West St Hwy') {
                    zSpans = [[land[0], land[1]]];
                } else if (name === 'FDR Drive') {
                    zSpans = [[land[0], Math.min(FDR_END, land[1])]];
                } else if (x > PARK_WEST && x < PARK_EAST) {
                    // 6th / 7th are interrupted by Central Park
                    zSpans = [[land[0], PARK_NORTH], [PARK_SOUTH, Math.min(AVE_DOWNTOWN_END, land[1])]];
                } else {
                    zSpans = [[land[0], Math.min(AVE_DOWNTOWN_END, land[1])]];
                }
                for (const [z0, z1] of zSpans) {
                    if (z1 - z0 < 30) continue;
                    this.segments.push({
                        dir: 'ns', name, x, ax: x, az: z0, bx: x, bz: z1,
                        width, lanes, oneway, major: true, bk: false,
                    });
                }
            }
        }

        _deriveStreets() {
            for (const [name, z, cls, dir, x1, x2] of STREETS) {
                const land = LandMask.xRangeAtZ(z);
                if (!land) continue;
                const w = streetWidth(name, cls, z);
                let lo = Math.max(x1 !== undefined ? x1 : AVENUES[0][1], land[0]);
                let hi = Math.min(x2 !== undefined ? x2 : AVENUES[AVENUES.length - 1][1], land[1]);
                if (hi - lo < 30) continue;
                let spans;
                if (z > PARK_NORTH && z < PARK_SOUTH) {
                    if (TRANSVERSE_Z.indexOf(z) >= 0) {
                        spans = [[lo, hi]]; // sunken transverse, drives through
                    } else {
                        spans = [[lo, PARK_WEST], [PARK_EAST, hi]];
                    }
                } else {
                    spans = [[lo, hi]];
                }
                for (const [a, b] of spans) {
                    if (b - a < 30) continue;
                    this.segments.push({
                        dir: 'ew', name, z, ax: a, az: z, bx: b, bz: z,
                        width: w, lanes: cls === 'M' ? 2 : 1,
                        oneway: cls === 'M' ? null : dir, major: cls === 'M',
                        transverse: TRANSVERSE_Z.indexOf(z) >= 0, bk: false,
                    });
                }
            }
        }

        _deriveBroadway() {
            for (let i = 0; i < BROADWAY.length - 1; i++) {
                const [ax, az] = BROADWAY[i], [bx, bz] = BROADWAY[i + 1];
                this.segments.push({
                    dir: 'diag', name: 'Broadway', ax, az, bx, bz,
                    width: BROADWAY_W, lanes: 2, oneway: null, major: true, bk: false,
                });
            }
        }

        _deriveBrooklyn() {
            const B = BROOKLYN;
            for (const [name, x, cls] of B.avenues) {
                this.segments.push({
                    dir: 'ns', name, x, ax: x, az: B.z1, bx: x, bz: B.z2,
                    width: cls === 'M' ? 13 : 9, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: true,
                });
            }
            for (const [name, z, cls] of B.streets) {
                this.segments.push({
                    dir: 'ew', name, z, ax: B.x1, az: z, bx: B.x2, bz: z,
                    width: cls === 'M' ? 13 : 9, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: true,
                });
            }
        }

        _deriveParadise() {
            if (typeof PARADISE === 'undefined') return;
            const P = PARADISE;
            for (const [name, x, cls] of P.avenues) {
                if (name === 'Palisades Parkway') {
                    // Split around Paradise River Bridge [-750, 1850 -> -750, 1710] so no road runs below bridge
                    // North approach connects directly via the scenic winding mountain road to the VIP Villa
                    this.segments.push({
                        dir: 'ns', name, x, ax: x, az: 1850, bx: x, bz: P.zSouth2,
                        width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                        oneway: null, major: cls === 'M', bk: false, paradise: true,
                    });
                } else {
                    this.segments.push({
                        dir: 'ns', name, x, ax: x, az: P.zSouth1, bx: x, bz: P.zSouth2,
                        width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                        oneway: null, major: cls === 'M', bk: false, paradise: true,
                    });
                }
            }
            for (const [name, z, cls] of P.streets) {
                this.segments.push({
                    dir: 'ew', name, z, ax: P.x1, az: z, bx: P.x2, bz: z,
                    width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: false, paradise: true,
                });
            }

            // Scenic Winding Mountain Road connecting Paradise River Bridgehead to VIP Modern Villa Estate & Garage
            const mountainRoad = [
                [-750, 1710],
                [-712, 1696],
                [-674, 1685],
                [-650, 1675],
                [-646, 1664],
                [-660, 1654],
                [-691, 1643],
                [-734, 1633],
                [-781, 1622],
                [-823, 1612],
                [-854, 1601],
                [-869, 1591],
                [-864, 1581],
                [-838, 1570],
                [-773, 1560],
                [-757, 1549],
                [-762, 1520],
            ];
            for (let i = 0; i < mountainRoad.length - 1; i++) {
                const a = mountainRoad[i], b = mountainRoad[i + 1];
                this.segments.push({
                    dir: 'diag', name: 'San Andreas Mountain Pass',
                    ax: a[0], az: a[1], bx: b[0], bz: b[1],
                    width: 11, lanes: 2, oneway: null, major: true, bk: false, paradise: true, mountain: true,
                });
            }
        }

        _deriveQueens() {
            if (typeof QUEENS === 'undefined') return;
            const Q = QUEENS;
            for (const [name, x, cls] of Q.avenues) {
                this.segments.push({
                    dir: 'ns', name, x, ax: x, az: Q.z1, bx: x, bz: Q.z2,
                    width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: false, queens: true,
                });
            }
            for (const [name, z, cls] of Q.streets) {
                this.segments.push({
                    dir: 'ew', name, z, ax: Q.x1, az: z, bx: Q.x2, bz: z,
                    width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: false, queens: true,
                });
            }
        }

        _deriveViceShores() {
            if (typeof VICE_SHORES === 'undefined') return;
            const V = VICE_SHORES;
            for (const [name, x, cls] of V.avenues) {
                this.segments.push({
                    dir: 'ns', name, x, ax: x, az: V.z1, bx: x, bz: V.z2,
                    width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: false, vice: true,
                });
            }
            for (const [name, z, cls] of V.streets) {
                this.segments.push({
                    dir: 'ew', name, z, ax: V.x1, az: z, bx: V.x2, bz: z,
                    width: cls === 'M' ? 14 : 10, lanes: cls === 'M' ? 2 : 1,
                    oneway: null, major: cls === 'M', bk: false, vice: true,
                });
            }
        }

        _deriveGovernors() {
            if (typeof GOVERNORS === 'undefined') return;
            const G = GOVERNORS;
            for (const [name, x, cls] of G.avenues) {
                this.segments.push({
                    dir: 'ns', name, x, ax: x, az: G.z1, bx: x, bz: G.z2,
                    width: cls === 'M' ? 12 : 9, lanes: 1,
                    oneway: null, major: cls === 'M', bk: false, governors: true,
                });
            }
            for (const [name, z, cls] of G.streets) {
                this.segments.push({
                    dir: 'ew', name, z, ax: G.x1, az: z, bx: G.x2, bz: z,
                    width: cls === 'M' ? 12 : 9, lanes: 1,
                    oneway: null, major: cls === 'M', bk: false, governors: true,
                });
            }
        }

        _deriveBridges() {
            for (const b of BRIDGES) {
                this.segments.push({
                    dir: 'diag', name: b.name,
                    ax: b.deck[0], az: b.deck[1], bx: b.deck[2], bz: b.deck[3],
                    width: b.width || (b.wide ? 18 : 11), lanes: b.lanes || (b.wide ? 4 : 2), oneway: null, major: !!b.wide, bridge: b, bk: false,
                });
            }
        }

        // ---- intersections + lane graph --------------------------------------
        _nodeAt(x, z) {
            const key = (Math.round(x)).toString() + '|' + (Math.round(z)).toString();
            let n = this.nodeByIdx.get(key);
            if (!n) {
                n = { id: this.nodes.length, x, z, out: [], key };
                this.nodes.push(n);
                this.nodeByIdx.set(key, n);
            }
            return n;
        }

        _deriveNodesAndEdges() {
            const ns = this.segments.filter(s => s.dir === 'ns');
            const ew = this.segments.filter(s => s.dir === 'ew');
            const dg = this.segments.filter(s => s.dir === 'diag');

            // Ensure all diagonal segments (mountain passes, ramps, Broadway links) have nodes at their endpoints
            for (const d of dg) {
                this._nodeAt(d.ax, d.az);
                this._nodeAt(d.bx, d.bz);
            }

            // Bridges: explicitly create nodes at both bridgeheads and intermediate spans
            for (const b of this.segments.filter(s => s.bridge)) {
                const nSteps = Math.max(2, Math.round(Math.hypot(b.bx - b.ax, b.bz - b.az) / 75));
                for (let i = 0; i <= nSteps; i++) {
                    const t = i / nSteps;
                    const bx = b.ax + (b.bx - b.ax) * t;
                    const bz = b.az + (b.bz - b.az) * t;
                    const node = this._nodeAt(bx, bz);
                    if (!node.diag) node.diag = b;
                }
            }

            // Avenue x street
            for (const a of ns) {
                for (const s of ew) {
                    if (a.bk !== s.bk) continue;
                    if (s.z < a.az || s.z > a.bz) continue;
                    if (a.x < s.ax || a.x > s.bx) continue;
                    const node = this._nodeAt(a.x, s.z);
                    node.ns = a; node.ew = s;
                    if (!a.bridge && !s.bridge) {
                        node.hasLight = true;
                        this.lights.push({ x: a.x, z: s.z, node });
                    }
                }
            }
            // Broadway / bridges x street
            for (const d of dg) {
                for (const s of ew) {
                    if (d.bk !== s.bk && !d.bridge) continue;
                    if (s.z < Math.min(d.az, d.bz) || s.z > Math.max(d.az, d.bz)) continue;
                    const t = (s.z - d.az) / (d.bz - d.az || 1);
                    const x = d.ax + (d.bx - d.ax) * t;
                    if (x < s.ax || x > s.bx) continue;
                    const node = this._nodeAt(x, s.z);
                    if (!node.ns) node.diag = d;
                    if (!node.ew) node.ew = s;
                    if (!d.bridge && !s.bridge) {
                        node.hasLight = true;
                        this.lights.push({ x, z: s.z, node });
                    }
                }
            }
            // Broadway x avenue
            for (const d of dg) {
                if (d.bridge) continue;
                for (const a of ns) {
                    if (a.bk !== d.bk) continue;
                    const minX = Math.min(d.ax, d.bx), maxX = Math.max(d.ax, d.bx);
                    if (a.x < minX || a.x > maxX) continue;
                    const t = (a.x - d.ax) / (d.bx - d.ax || 1);
                    const z = d.az + (d.bz - d.az) * t;
                    if (z < Math.min(a.az, a.bz) || z > Math.max(a.az, a.bz)) continue;
                    const node = this._nodeAt(a.x, z);
                    if (!node.ns) node.ns = a;
                    if (!node.diag) node.diag = d;
                    if (!a.bridge) {
                        node.hasLight = true;
                        this.lights.push({ x: a.x, z, node });
                    }
                }
            }

            // Deduplicate traffic lights and strip lights directly at bridge entrance/exit ramps
            const bridgeSegs = this.segments.filter(s => s.bridge);
            const uniqueLights = [];
            for (let i = 0; i < this.lights.length; i++) {
                const l = this.lights[i];
                const atBridge = bridgeSegs.some(b => Math.hypot(l.x - b.ax, l.z - b.az) < 6 || Math.hypot(l.x - b.bx, l.z - b.bz) < 6);
                if (atBridge) {
                    if (l.node) l.node.hasLight = false;
                    continue;
                }
                if (!uniqueLights.some(u => Math.hypot(u.x - l.x, u.z - l.z) < 6.0)) {
                    uniqueLights.push(l);
                }
            }
            this.lights = uniqueLights;

            // Directed edges along each segment, between consecutive nodes.
            for (const seg of this.segments) {
                const onSeg = this.nodes.filter(n => {
                    if (seg.dir === 'ns') return n.z >= seg.az && n.z <= seg.bz && Math.abs(n.x - seg.x) < 1;
                    if (seg.dir === 'ew') return n.x >= seg.ax && n.x <= seg.bx && Math.abs(n.z - seg.z) < 1;
                    // diag: parametric distance of node to the segment line
                    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
                    const L2 = dx * dx + dz * dz;
                    const t = ((n.x - seg.ax) * dx + (n.z - seg.az) * dz) / L2;
                    if (t < -0.02 || t > 1.02) return false;
                    const px = seg.ax + dx * t, pz = seg.az + dz * t;
                    return dist2(n.x, n.z, px, pz) < 4;
                });
                if (!onSeg.length) continue;
                // Sort along the segment axis
                if (seg.dir === 'ew') {
                    onSeg.sort((p, q) => p.x - q.x);
                } else if (seg.dir === 'ns') {
                    onSeg.sort((p, q) => p.z - q.z);
                } else {
                    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
                    onSeg.sort((p, q) => ((p.x - seg.ax) * dx + (p.z - seg.az) * dz) - ((q.x - seg.ax) * dx + (q.z - seg.az) * dz));
                }
                const link = (a, b) => {
                    this._addEdge(seg, a, b);
                    this._addEdge(seg, b, a);
                };
                if (seg.oneway === 'NB') {
                    // northbound only: from high z to low z
                    for (let i = onSeg.length - 1; i > 0; i--) this._addEdge(seg, onSeg[i], onSeg[i - 1]);
                } else if (seg.oneway === 'SB') {
                    for (let i = 0; i < onSeg.length - 1; i++) this._addEdge(seg, onSeg[i], onSeg[i + 1]);
                } else if (seg.oneway === 'EB') {
                    for (let i = 0; i < onSeg.length - 1; i++) this._addEdge(seg, onSeg[i], onSeg[i + 1]);
                } else if (seg.oneway === 'WB') {
                    for (let i = onSeg.length - 1; i > 0; i--) this._addEdge(seg, onSeg[i], onSeg[i - 1]);
                } else {
                    for (let i = 0; i < onSeg.length - 1; i++) link(onSeg[i], onSeg[i + 1]);
                }
            }

            // Bridgehead & causeway road network stitching:
            // Ensure all dead-end, bridgehead, or ramp nodes snap and link to adjacent road nodes within 22m
            for (const n of this.nodes) {
                if (n.out.length <= 2) {
                    for (const other of this.nodes) {
                        if (other.id === n.id) continue;
                        const d = Math.hypot(n.x - other.x, n.z - other.z);
                        if (d > 0.1 && d <= 22 && !n.out.some(e => e.to === other.id)) {
                            const seg = n.ns || n.ew || n.diag || other.ns || other.ew || other.diag || this.segments[0];
                            this._addEdge(seg, n, other);
                            this._addEdge(seg, other, n);
                        }
                    }
                }
            }

            // Precompute turn candidates (no per-frame graph scans).
            for (const e of this.edges) {
                const out = this.nodes[e.to].out.filter(o => o.to !== e.from || this.nodes[e.to].out.length === 1);
                e.next = out.length ? out : this.nodes[e.to].out;
            }
        }

        _addEdge(seg, a, b) {
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 8) return; // too short to bother
            // Lane offset: right-hand side of travel, lane center at width/4.
            const ux = dx / len, uz = dz / len;
            const off = seg.width / 4;
            const lx = -uz * off, lz = ux * off; // right vector for y-up CCW: (uz, -ux) rotated... keep consistent below
            const e = {
                id: this.edges.length,
                from: a.id, to: b.id,
                ax: a.x + lx, az: a.z + lz, bx: b.x + lx, bz: b.z + lz,
                dirX: ux, dirZ: uz, length: len,
                seg, speed: seg.major ? 14 : 10, oneway: seg.oneway,
            };
            this.edges.push(e);
            a.out.push(e);
        }

        // ---- blocks -----------------------------------------------------------
        /**
         * Block derivation is subtractive: emit generous candidate rects for
         * each grid cell, then carve every road corridor, park and stretch of
         * water out of them. Anything that survives is guaranteed buildable, so
         * no lot can ever land on asphalt no matter how the MAP tables change.
         */
        _deriveBlocks() {
            const aveXs = AVENUES.map(a => a[1]);
            const strZs = STREETS.map(s => s[1]);
            // Manhattan grid blocks: consecutive avenue gaps x street gaps.
            // Stops at Houston — below it the numbered avenues end and the
            // downtown strips below take over (otherwise the two overlap).
            for (let i = 0; i < aveXs.length - 1; i++) {
                const x1 = aveXs[i], x2 = aveXs[i + 1];
                if (x2 - x1 < 20) continue;
                for (let j = 0; j < strZs.length - 1; j++) {
                    if (strZs[j + 1] > AVE_DOWNTOWN_END) break;
                    this._tryBlock(x1, strZs[j], x2, strZs[j + 1], false);
                }
            }
            // Downtown strips: below Houston the numbered avenues stop, so a
            // candidate spans shore to shore and the carve splits it along
            // Broadway and whatever else actually runs through.
            const dt0 = strZs.indexOf(AVE_DOWNTOWN_END);
            for (let j = dt0; j < strZs.length - 1; j++) {
                const zMid = (strZs[j] + strZs[j + 1]) / 2;
                const land = LandMask.xRangeAtZ(zMid);
                if (!land) continue;
                this._tryBlock(Math.max(AVENUES[0][1], land[0]), strZs[j],
                    Math.min(AVENUES[AVENUES.length - 1][1], land[1]), strZs[j + 1], false);
            }
            // Brooklyn blocks
            const B = BROOKLYN;
            const bxs = [B.x1, ...B.avenues.map(a => a[1]), B.x2];
            const bzs = [B.z1, ...B.streets.map(s => s[1]), B.z2];
            for (let i = 0; i < bxs.length - 1; i++) {
                for (let j = 0; j < bzs.length - 1; j++) {
                    this._tryBlock(bxs[i], bzs[j], bxs[i + 1], bzs[j + 1], true);
                }
            }
            // Paradise City blocks
            if (typeof PARADISE !== 'undefined') {
                const P = PARADISE;
                const pxs = [P.x1, ...P.avenues.map(a => a[1]).sort((a, b) => a - b), P.x2];
                const pzs = [P.zSouth1, ...P.streets.map(s => s[1]).sort((a, b) => a - b), P.zSouth2];
                for (let i = 0; i < pxs.length - 1; i++) {
                    for (let j = 0; j < pzs.length - 1; j++) {
                        this._tryBlock(pxs[i], pzs[j], pxs[i + 1], pzs[j + 1], false);
                    }
                }
            }
            // Queens blocks
            if (typeof QUEENS !== 'undefined') {
                const Q = QUEENS;
                const qxs = [Q.x1, ...Q.avenues.map(a => a[1]).sort((a, b) => a - b), Q.x2];
                const qzs = [Q.z1, ...Q.streets.map(s => s[1]).sort((a, b) => a - b), Q.z2];
                for (let i = 0; i < qxs.length - 1; i++) {
                    for (let j = 0; j < qzs.length - 1; j++) {
                        this._tryBlock(qxs[i], qzs[j], qxs[i + 1], qzs[j + 1], false);
                    }
                }
            }
            // Vice Shores blocks
            if (typeof VICE_SHORES !== 'undefined') {
                const V = VICE_SHORES;
                const vxs = [V.x1, ...V.avenues.map(a => a[1]).sort((a, b) => a - b), V.x2];
                const vzs = [V.z1, ...V.streets.map(s => s[1]).sort((a, b) => a - b), V.z2];
                for (let i = 0; i < vxs.length - 1; i++) {
                    for (let j = 0; j < vzs.length - 1; j++) {
                        this._tryBlock(vxs[i], vzs[j], vxs[i + 1], vzs[j + 1], false);
                    }
                }
            }
            // Governors Island blocks
            if (typeof GOVERNORS !== 'undefined') {
                const G = GOVERNORS;
                const gxs = [G.x1, ...G.avenues.map(a => a[1]).sort((a, b) => a - b), G.x2];
                const gzs = [G.z1, ...G.streets.map(s => s[1]).sort((a, b) => a - b), G.z2];
                for (let i = 0; i < gxs.length - 1; i++) {
                    for (let j = 0; j < gzs.length - 1; j++) {
                        this._tryBlock(gxs[i], gzs[j], gxs[i + 1], gzs[j + 1], false);
                    }
                }
            }
        }

        /**
         * Everything that must be carved out of a candidate block: road
         * corridors (plus a sidewalk margin) and park/square greens.
         */
        _obstaclesFor(cand, bk) {
            const out = roadObstacles(this.segments, cand, bk, BLOCK_MARGIN, []);
            // Parks and squares are green, not buildable.
            for (const [x1, z1, x2, z2] of PARKS) {
                if (x2 < cand.x1 || x1 > cand.x2 || z2 < cand.z1 || z1 > cand.z2) continue;
                out.push({ x1: x1 - 1, z1: z1 - 1, x2: x2 + 1, z2: z2 + 1 });
            }
            return out;
        }

        /**
         * Carve a candidate rect down to buildable pieces. Slivers narrower
         * than BLOCK_MIN in either axis are dropped (they become sidewalk).
         */
        _carve(cand, obstacles) {
            let cur = [cand];
            for (const ob of obstacles) {
                if (!cur.length) break;
                const next = [];
                for (const r of cur) rectSubtract(r, ob, next, BLOCK_MIN);
                cur = next;
                if (cur.length > 16) { // fragmentation guard: keep the biggest pieces
                    cur.sort((p, q) => (q.x2 - q.x1) * (q.z2 - q.z1) - (p.x2 - p.x1) * (p.z2 - p.z1));
                    cur.length = 16;
                }
            }
            return cur;
        }

        _tryBlock(x1, z1, x2, z2, bk) {
            if (x2 - x1 < BLOCK_MIN || z2 - z1 < BLOCK_MIN) return;
            const cand = { x1, z1, x2, z2 };
            for (const piece of this._carve(cand, this._obstaclesFor(cand, bk))) {
                this._emitBlock(piece, bk);
            }
        }

        _emitBlock(r, bk) {
            let { x1, z1, x2, z2 } = r;
            const isGov = (typeof GOVERNORS !== 'undefined' && z1 >= 3400);
            if (!bk && !isGov && x1 >= 0 && x1 < 1200 && z1 < 3380) {
                // Clip to land along both edges, then require all four corners
                // ashore so nothing overhangs the shoreline taper.
                const a = LandMask.xRangeAtZ(z1), b = LandMask.xRangeAtZ(z2);
                if (!a || !b) return;
                x1 = Math.max(x1, a[0] + 3, b[0] + 3);
                x2 = Math.min(x2, a[1] - 3, b[1] - 3);
                if (x2 - x1 < BLOCK_MIN || z2 - z1 < BLOCK_MIN) return;
                if (!LandMask.inside(x1, z1) || !LandMask.inside(x2, z1) ||
                    !LandMask.inside(x1, z2) || !LandMask.inside(x2, z2)) return;
            } else {
                if (!LandMask.inside(x1, z1) || !LandMask.inside(x2, z2)) return;
            }
            const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
            let district = null, grammar = null;
            if (bk) { district = 'brooklyn'; grammar = 'warehouse'; }
            else if (cx < 0) { district = 'paradise_city'; grammar = 'commercial'; }
            else if (typeof QUEENS !== 'undefined' && cx >= QUEENS.x1 && cx <= QUEENS.x2 && cz >= QUEENS.z1 && cz <= QUEENS.z2) {
                district = 'queens'; grammar = 'warehouse';
            }
            else if (typeof VICE_SHORES !== 'undefined' && cx >= 1640 && cz >= 2000) {
                district = 'vice_shores'; grammar = 'commercial';
            }
            else if (typeof GOVERNORS !== 'undefined' && cx >= GOVERNORS.x1 && cx <= GOVERNORS.x2 && cz >= GOVERNORS.z1 && cz <= GOVERNORS.z2) {
                district = 'governors'; grammar = 'tenement';
            }
            else {
                for (const [id, dx1, dz1, dx2, dz2, g] of DISTRICTS) {
                    if (cx >= dx1 && cx <= dx2 && cz >= dz1 && cz <= dz2) { district = id; grammar = g; break; }
                }
            }
            if (!district || grammar === 'park') return;
            const seed = (this.blocks.length * 374761393 + (cx * 69069 + cz * 2654435761 | 0)) >>> 0;
            this.blocks.push({ x1, z1, x2, z2, cx, cz, district, grammar, bk, seed });
        }

        // ---- sidewalk graph ----------------------------------------------------
        /**
         * The walkable network. Two kinds of edge:
         *   - ring edges following a block's perimeter, one sidewalk-width in
         *     from the curb;
         *   - crosswalk edges joining the two block corners that face each other
         *     across exactly one road, tagged with the road they cross so a ped
         *     can look up the signal and the oncoming lane before stepping off.
         * Corner-to-corner only. The old graph linked any two nodes within 30 m,
         * which is what used to send peds diagonally through the middle of an
         * intersection and straight out into moving traffic.
         */
        _deriveSidewalkGraph() {
            const nodes = this.sidewalkNodes;

            // --- 1. block perimeter rings -------------------------------------
            for (let bi = 0; bi < this.blocks.length; bi++) {
                const b = this.blocks[bi];
                const X1 = b.x1 + SW_INSET, Z1 = b.z1 + SW_INSET;
                const X2 = b.x2 - SW_INSET, Z2 = b.z2 - SW_INSET;
                if (X2 - X1 < 4 || Z2 - Z1 < 4) continue;   // sliver: not walkable
                const ids = [];
                const poi = SW_POI_WEIGHT[b.grammar] || 0;
                const run = (ax, az, bx, bz) => {
                    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / SW_SPACING));
                    for (let k = 0; k < steps; k++) {
                        const t = k / steps;
                        nodes.push({
                            x: ax + (bx - ax) * t, z: az + (bz - az) * t,
                            nbrs: [], xw: [], blk: bi, corner: k === 0, poi,
                        });
                        ids.push(nodes.length - 1);
                    }
                };
                run(X1, Z1, X2, Z1); run(X2, Z1, X2, Z2);
                run(X2, Z2, X1, Z2); run(X1, Z2, X1, Z1);
                for (let k = 0; k < ids.length; k++) {
                    this._swLink(ids[k], ids[(k + 1) % ids.length], null);
                }
                b.ring = ids;
            }

            // --- 2. hash the corners so crosswalk ends are cheap to find ------
            const CELL = 32;
            const ckey = (x, z) => Math.floor(x / CELL) + '|' + Math.floor(z / CELL);
            const corners = new Map();
            for (let i = 0; i < nodes.length; i++) {
                if (!nodes[i].corner) continue;
                const k = ckey(nodes[i].x, nodes[i].z);
                let a = corners.get(k);
                if (!a) corners.set(k, a = []);
                a.push(i);
            }
            /**
             * Closest corner node inside a tight box hugging one quadrant of an
             * intersection. The box (not a radius) is what keeps a carved-out
             * sliver deep inside a block from winning and producing a crosswalk
             * that ends nowhere.
             */
            const REACH = 18;
            const quadCorner = (ix, iz, sx, sz, hwx, hwz) => {
                let best = -1, bestD = Infinity;
                const c0x = Math.floor((ix - hwx - REACH) / CELL), c1x = Math.floor((ix + hwx + REACH) / CELL);
                const c0z = Math.floor((iz - hwz - REACH) / CELL), c1z = Math.floor((iz + hwz + REACH) / CELL);
                for (let cx = c0x; cx <= c1x; cx++) {
                    for (let cz = c0z; cz <= c1z; cz++) {
                        const arr = corners.get(cx + '|' + cz);
                        if (!arr) continue;
                        for (const i of arr) {
                            const dx = (nodes[i].x - ix) * sx, dz = (nodes[i].z - iz) * sz;
                            if (dx < hwx - 1.5 || dx > hwx + REACH) continue;
                            if (dz < hwz - 1.5 || dz > hwz + REACH) continue;
                            const d = dx * dx + dz * dz;
                            if (d < bestD) { bestD = d; best = i; }
                        }
                    }
                }
                return best;
            };

            // --- 3. crosswalks, four per signalized intersection --------------
            for (const n of this.nodes) {
                const nsSeg = n.ns || n.diag;
                const ewSeg = n.ew;
                if (!nsSeg || !ewSeg) continue;              // T-stub: rings suffice
                if (nsSeg.bridge || ewSeg.bridge) continue;
                const hwx = nsSeg.width / 2, hwz = ewSeg.width / 2;
                const nw = quadCorner(n.x, n.z, -1, -1, hwx, hwz);
                const ne = quadCorner(n.x, n.z, 1, -1, hwx, hwz);
                const sw = quadCorner(n.x, n.z, -1, 1, hwx, hwz);
                const se = quadCorner(n.x, n.z, 1, 1, hwx, hwz);
                const mk = (a, b, axis, road, seg) => {
                    if (a < 0 || b < 0) return;
                    this._swLink(a, b, {
                        axis, road, seg, width: seg.width,
                        mx: (nodes[a].x + nodes[b].x) / 2,
                        mz: (nodes[a].z + nodes[b].z) / 2,
                        light: !!n.hasLight, node: n.id,
                    });
                };
                mk(nw, ne, 'x', 'ns', nsSeg);                // across the avenue
                mk(sw, se, 'x', 'ns', nsSeg);
                mk(nw, sw, 'z', 'ew', ewSeg);                // across the street
                mk(ne, se, 'z', 'ew', ewSeg);
                if (n.hasLight) {
                    for (const i of [nw, ne, sw, se]) if (i >= 0) nodes[i].poi += 2;
                }
            }

            // --- 4. position hash for nearestSidewalk -------------------------
            this._swCell = CELL;
            this._swHash = new Map();
            for (let i = 0; i < nodes.length; i++) {
                const k = ckey(nodes[i].x, nodes[i].z);
                let a = this._swHash.get(k);
                if (!a) this._swHash.set(k, a = []);
                a.push(i);
            }

            this.finalizeSidewalk();
        }

        /**
         * Make the walkable graph one connected network.
         *
         * Crosswalks only appear where a full four-corner intersection was found,
         * so carved block fragments and odd junctions leave pockets of sidewalk
         * with no legal way out. Weld each pocket to the main network by its
         * shortest hop, tagging the hop as a crosswalk when it lands across a
         * road; anything still stranded is unlinked outright so no ped can ever
         * spawn into it. Idempotent — the builder calls it again after pruning
         * nodes that ended up inside geometry.
         */
        finalizeSidewalk() {
            const nodes = this.sidewalkNodes;
            const N = nodes.length;
            const comp = new Int32Array(N);
            const stack = [];
            const label = () => {
                comp.fill(-1);
                const sizes = [];
                for (let s = 0; s < N; s++) {
                    if (comp[s] !== -1 || !nodes[s].nbrs.length) continue;
                    const c = sizes.length;
                    let size = 0;
                    comp[s] = c; stack.length = 0; stack.push(s);
                    while (stack.length) {
                        const k = stack.pop(); size++;
                        for (const nb of nodes[k].nbrs) {
                            if (comp[nb] === -1) { comp[nb] = c; stack.push(nb); }
                        }
                    }
                    sizes.push(size);
                }
                return sizes;
            };
            const REACH = 46;
            for (let pass = 0; pass < 24; pass++) {
                const sizes = label();
                if (sizes.length <= 1) break;
                let main = 0;
                for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[main]) main = c;
                // One shortest weld per stranded component per pass; repeated
                // passes chain pocket -> pocket -> main until nothing moves.
                const best = new Map();
                for (let i = 0; i < N; i++) {
                    if (comp[i] === -1 || comp[i] === main) continue;
                    const cand = this._nearestOtherComp(i, comp, REACH);
                    if (!cand) continue;
                    const cur = best.get(comp[i]);
                    if (!cur || cand.d < cur.d) best.set(comp[i], { a: i, b: cand.j, d: cand.d });
                }
                if (!best.size) break;
                for (const { a, b } of best.values()) {
                    const na = nodes[a], nb = nodes[b];
                    const road = this._roadCrossedBy(na.x, na.z, nb.x, nb.z);
                    this._swLink(a, b, road ? {
                        axis: road.dir === 'ew' ? 'z' : 'x',
                        road: road.dir === 'ew' ? 'ew' : 'ns',
                        seg: road, width: road.width,
                        mx: (na.x + nb.x) / 2, mz: (na.z + nb.z) / 2,
                        light: false, node: -1,
                    } : null);
                }
            }
            // Keep only the main component: a ped stranded in a two-block pocket
            // reads as broken, and an unreachable node is worse than no node.
            const sizes = label();
            if (sizes.length > 1) {
                let main = 0;
                for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[main]) main = c;
                for (let i = 0; i < N; i++) {
                    if (comp[i] !== main) { nodes[i].nbrs = []; nodes[i].xw = []; }
                }
            }
        }

        /** Closest node to `i` that belongs to a different component, within reach. */
        _nearestOtherComp(i, comp, reach) {
            const nodes = this.sidewalkNodes;
            const C = this._swCell || 32;
            const n = nodes[i];
            const r = Math.ceil(reach / C);
            const cx = Math.floor(n.x / C), cz = Math.floor(n.z / C);
            let bj = -1, bd = reach * reach;
            for (let ix = cx - r; ix <= cx + r; ix++) {
                for (let iz = cz - r; iz <= cz + r; iz++) {
                    const arr = this._swHash.get(ix + '|' + iz);
                    if (!arr) continue;
                    for (const j of arr) {
                        if (comp[j] === -1 || comp[j] === comp[i]) continue;
                        const road = this._roadCrossedBy(n.x, n.z, nodes[j].x, nodes[j].z);
                        if (road && (!n.corner || !nodes[j].corner)) continue;
                        const d = dist2(n.x, n.z, nodes[j].x, nodes[j].z);
                        if (d < bd) { bd = d; bj = j; }
                    }
                }
            }
            return bj === -1 ? null : { j: bj, d: Math.sqrt(bd) };
        }

        /** The widest road corridor containing the midpoint of a-b, or null. */
        _roadCrossedBy(x0, z0, x1, z1) {
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
            const bk = mx >= BROOKLYN.x1 && mx <= BROOKLYN.x2 && mz >= BROOKLYN.z1 && mz <= BROOKLYN.z2;
            let best = null, bestW = -1;
            for (const seg of this.segments) {
                if (seg.bridge || seg.bk !== bk) continue;
                const hw = seg.width / 2 + 0.5;
                if (seg.dir === 'ns') {
                    if (mz < seg.az || mz > seg.bz || Math.abs(mx - seg.x) > hw) continue;
                } else if (seg.dir === 'ew') {
                    if (mx < seg.ax || mx > seg.bx || Math.abs(mz - seg.z) > hw) continue;
                } else {
                    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
                    const L2 = dx * dx + dz * dz || 1;
                    const t = clamp(((mx - seg.ax) * dx + (mz - seg.az) * dz) / L2, 0, 1);
                    if (dist2(mx, mz, seg.ax + dx * t, seg.az + dz * t) > hw * hw) continue;
                }
                if (seg.width > bestW) { bestW = seg.width; best = seg; }
            }
            return best;
        }

        /** Undirected sidewalk link. `cross` is a shared crosswalk record or null. */
        _swLink(a, b, cross) {
            if (a === b || a < 0 || b < 0) return;
            const na = this.sidewalkNodes[a], nb = this.sidewalkNodes[b];
            if (na.nbrs.indexOf(b) !== -1) return;
            na.nbrs.push(b); na.xw.push(cross);
            nb.nbrs.push(a); nb.xw.push(cross);
        }

        /**
         * Nearest walkable sidewalk node, by expanding ring over the hash. Scans
         * one ring past the first hit so an early edge-of-cell candidate can't
         * beat a genuinely closer node next door. -1 if nothing walkable is near.
         */
        nearestSidewalk(x, z) {
            const nodes = this.sidewalkNodes;
            const C = this._swCell || 32;
            if (!this._swHash) return -1;
            const cx = Math.floor(x / C), cz = Math.floor(z / C);
            let best = -1, bestD = Infinity, foundAt = -1;
            for (let r = 0; r <= 6; r++) {
                for (let ix = cx - r; ix <= cx + r; ix++) {
                    for (let iz = cz - r; iz <= cz + r; iz++) {
                        if (r > 0 && Math.abs(ix - cx) !== r && Math.abs(iz - cz) !== r) continue;
                        const arr = this._swHash.get(ix + '|' + iz);
                        if (!arr) continue;
                        for (const i of arr) {
                            if (!nodes[i].nbrs.length) continue;
                            const d = dist2(nodes[i].x, nodes[i].z, x, z);
                            if (d < bestD) { bestD = d; best = i; }
                        }
                    }
                }
                if (best >= 0 && foundAt < 0) foundAt = r;
                if (foundAt >= 0 && r > foundAt) break;
            }
            return best;
        }

        /** The crosswalk record for the link node a -> b, or null. */
        crossingBetween(a, b) {
            const na = this.sidewalkNodes[a];
            if (!na) return null;
            const k = na.nbrs.indexOf(b);
            return k === -1 ? null : na.xw[k];
        }

        // ---- parked car spots (curbside lanes along avenues) --------------------
        _deriveParkedSpots() {
            const rng = mulberry32(777);
            for (const seg of this.segments) {
                if (seg.bridge) continue;
                if (seg.dir === 'diag') continue; // Broadway gets none
                const spacing = 22;
                if (seg.dir === 'ns') {
                    for (let z = seg.az + 20; z < seg.bz - 20; z += spacing) {
                        if (rng() < 0.42) {
                            const eastSide = rng() < 0.5;
                            const off = seg.width / 2 - 1.4;
                            this.parkedSpots.push({
                                x: seg.x + (eastSide ? off : -off),
                                z, heading: eastSide ? 0 : Math.PI, // facing traffic dir of that side
                                claimT: 0,                          // set when a car is on its way
                            });
                        }
                    }
                } else {
                    for (let x = seg.ax + 20; x < seg.bx - 20; x += spacing) {
                        if (rng() < 0.34) {
                            const southSide = rng() < 0.5;
                            const off = seg.width / 2 - 1.4;
                            this.parkedSpots.push({
                                x, z: seg.z + (southSide ? off : -off),
                                heading: southSide ? Math.PI / 2 : -Math.PI / 2,
                                claimT: 0,
                            });
                        }
                    }
                }
            }
        }
    }
