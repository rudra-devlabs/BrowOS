    // ===========================================================================
    // CITY (builder) — chunked geometry, colliders, props, minimap atlas
    // ===========================================================================
    const SIDEWALK_COLOR = col3(0xaba598);
    const ROAD_COLOR = col3(0x34363b);
    const CURB_COLOR = col3(0x8f8a7e);
    const MARK_COLOR = col3(0xe8e2c8);
    const YELLOW_COLOR = col3(0xd8b545);

    /**
     * CityBuilder turns the ManhattanMap into renderable, merged geometry.
     * Everything static lands in per-chunk GeoBatches (flat / facade / neon /
     * billboard buckets), so the whole island is a handful of draw calls per
     * visible chunk. It also collects static colliders and prop positions.
     */
    class CityBuilder {
        constructor(mat, assets) {
            this.mat = mat;
            this.assets = assets || null; // optional GLB pack (vehicles/peds handled elsewhere)
            this.map = new ManhattanMap();
            this.root = new THREE.Group();
            this.root.name = 'Manhattan';
            this.colliders = [];      // static AABBs {x,y,z,sx,sy,sz}
            this.buildingRects = [];  // building/house ground footprints {x0,z0,x1,z1}
            this.roadGuardSkips = []; // massing rejected for sitting on asphalt
            this.chunks = new Array(CHUNK_COLS * CHUNK_ROWS).fill(null);
            this.propSpots = { trees: [], lamps: [], hydrants: [], bins: [], atms: [], vendorCarts: [], subwayEntrances: [], trafficCones: [], waterTowers: [], rooftopAcUnits: [], fireEscapes: [], parkingBarriers: [], mailboxes: [], lens: [] };
            // Hand-authored campuses reserve their whole lot for the landmark.
            // Keep procedural edge props out instead of nudging them onto a
            // facade or, worse, into an explorable interior.
            this.propExclusionRects = [];
            this.map.foodStalls = this.propSpots.vendorCarts;
            this.lightAt = [];        // per signal: {x,z,lensBase}
            this.minimapAtlas = null;
            this.landMeshes = [];
            this.propMeshes = [];   // GLB prop meshes (bull/statue) join the instanced ones here
            // Optional GLB suburban houses: footprint-centered merged geometries
            // for Brooklyn residential blocks. {key: {geo, w, d, h}}
            this.houseDefs = {};
            this.houseSpots = {};   // {key: [{x, z, ry, s}]}
            if (this.assets && this.assets.houses) {
                for (const key of Object.keys(this.assets.houses)) {
                    try {
                        const geo = glbMergedGeometry(this.assets.houses[key].scene);
                        geo.computeBoundingBox();
                        const bb = geo.boundingBox;
                        // Ground the model and center its footprint so lot
                        // placement/rotation works off the origin.
                        geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
                        this.houseDefs[key] = {
                            geo, w: bb.max.x - bb.min.x, d: bb.max.z - bb.min.z, h: bb.max.y - bb.min.y,
                        };
                    } catch (e) { /* skip a broken house model */ }
                }
            }
            // Optional GLB urban buildings: footprint-centered merged geometries
            // for Manhattan & Brooklyn commercial/tenement/highrise blocks.
            this.buildingDefs = {};
            this.buildingSpots = {};   // {key: [{x, z, ry, sx, sy, sz}]}
            if (this.assets && this.assets.buildings) {
                for (const key of Object.keys(this.assets.buildings)) {
                    try {
                        const geo = glbMergedGeometry(this.assets.buildings[key].scene);
                        geo.computeBoundingBox();
                        const bb = geo.boundingBox;
                        geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
                        geo.computeBoundingBox();
                        this.buildingDefs[key] = {
                            geo, w: bb.max.x - bb.min.x, d: bb.max.z - bb.min.z, h: bb.max.y - bb.min.y,
                        };
                    } catch (e) { /* skip */ }
                }
            }
        }

        // ---- chunk routing -----------------------------------------------------
        _chunkAt(x, z) {
            const i = clamp(Math.floor((x - WORLD.MIN_X) / WORLD.CHUNK), 0, CHUNK_COLS - 1);
            const j = clamp(Math.floor((z - WORLD.MIN_Z) / WORLD.CHUNK), 0, CHUNK_ROWS - 1);
            let c = this.chunks[j * CHUNK_COLS + i];
            if (!c) {
                c = {
                    i, j, flat: new GeoBatch(), facades: {},
                    neon: new GeoBatch(), billboard: new GeoBatch(), meshes: [],
                };
                this.chunks[j * CHUNK_COLS + i] = c;
            }
            return c;
        }
        _facadeBatch(style, x, z) {
            const c = this._chunkAt(x, z);
            if (!c.facades[style]) c.facades[style] = new GeoBatch();
            return c.facades[style];
        }
        // Flat-batch primitives routed by position.
        fbox(x, y, z, sx, sy, sz, color, opts) {
            this._chunkAt(x, z).flat.box(x, y, z, sx, sy, sz, color, opts);
        }
            fdisc(x, y, z, r, seg, color, up) {
            this._chunkAt(x, z).flat.disc(x, y, z, r, seg, color, up);
        }
        fring(x, y, z, rInner, rOuter, seg, color, up) {
            this._chunkAt(x, z).flat.ring(x, y, z, rInner, rOuter, seg, color, up);
        }
        fcyl(x, y, z, rBot, rTop, h, seg, color, opts) {
            this._chunkAt(x, z).flat.cylinderY(x, y, z, rBot, rTop, h, seg, color, opts);
        }
        /** Free quad into the flat batch at (x,z). */
        fquad(a, b, c, d, n, color) {
            const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
            this._chunkAt(cx, cz).flat.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], n[0], n[1], n[2], color, null);
        }
        neonQuad(a, b, c, d, n, color) {
            const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
            this._chunkAt(cx, cz).neon.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], n[0], n[1], n[2], color, null);
        }
        /**
         * fquad with the winding auto-corrected against the declared normal:
         * pass the corners in any cyclic order and the face still ends up
         * front-facing along n. mat.flat is FrontSide, so a reversed quad is
         * an invisible hole — this removes the chance of writing one.
         */
        fquadN(a, b, c, d, n, color) {
            const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
            const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            if (nx * n[0] + ny * n[1] + nz * n[2] < 0) this.fquad(a, d, c, b, n, color);
            else this.fquad(a, b, c, d, n, color);
        }
        /**
         * Oriented beam from (x0,y0,z0) to (x1,y1,z1): w wide across its own
         * horizontal axis, h tall. fbox() is strictly axis-aligned, so this is
         * the only way to build a member that follows a diagonal or a slope
         * (bridge girders, rails, cables, truss chords).
         */
        _beam(x0, y0, z0, x1, y1, z1, w, h, color, caps = true) {
            const dx = x1 - x0, dz = z1 - z0;
            const dl = Math.sqrt(dx * dx + dz * dz) || 1e-6;
            const nx = dz / dl, nz = -dx / dl;             // horizontal perpendicular
            const px = nx * w / 2, pz = nz * w / 2, hh = h / 2;
            // a,b = start edge (-p,+p); c,d = end edge (-p,+p); 0 = bottom, 1 = top.
            const a0 = [x0 - px, y0 - hh, z0 - pz], a1 = [x0 - px, y0 + hh, z0 - pz];
            const b0 = [x0 + px, y0 - hh, z0 + pz], b1 = [x0 + px, y0 + hh, z0 + pz];
            const c0 = [x1 - px, y1 - hh, z1 - pz], c1 = [x1 - px, y1 + hh, z1 - pz];
            const d0 = [x1 + px, y1 - hh, z1 + pz], d1 = [x1 + px, y1 + hh, z1 + pz];
            this.fquadN(a1, b1, d1, c1, [0, 1, 0], color);
            this.fquadN(a0, b0, d0, c0, [0, -1, 0], color);
            this.fquadN(b0, b1, d1, d0, [nx, 0, nz], color);
            this.fquadN(a0, a1, c1, c0, [-nx, 0, -nz], color);
            if (caps) {
                this.fquadN(a0, a1, b1, b0, [-dx / dl, 0, -dz / dl], color);
                this.fquadN(c0, c1, d1, d0, [dx / dl, 0, dz / dl], color);
            }
        }
        /** Billboard panel: quad + atlas sub-rect [panelIndex 0..7]. */
        billboardQuad(a, b, c, d, n, panel, tint) {
            const cx = (a[0] + b[0] + c[0] + d[0]) / 4, cz = (a[2] + b[2] + c[2] + d[2]) / 4;
            const u0 = (panel % 4) * 0.25 + 0.004, u1 = u0 + 0.242;
            const v0 = Math.floor(panel / 4) * 0.5 + 0.006, v1 = v0 + 0.488;
            this._chunkAt(cx, cz).billboard.quad(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], n[0], n[1], n[2], tint || [1, 1, 1], [u0, v0, u1, v1]);
        }

        _collide(x, y, z, sx, sy, sz, tag, yaw, mesh) {
            const c = { x, y, z, sx, sy, sz, tag: tag || null, yaw: yaw || 0, mesh: mesh || null };
            this.colliders.push(c);
            return c;   // callers that own the box (houses, buildings) keep it
        }

        /** Record a building/house ground footprint (axis-aligned). */
        _markBuilding(x0, z0, x1, z1) {
            this.buildingRects.push({ x0, z0, x1, z1 });
        }

        /**
         * Nudge a prop point (in place) out of any building footprint it overlaps.
         * Prop spots are laid over the whole block but buildings fill much of the
         * lot, so trees/bins/food stalls can land inside a facade. Push the point
         * out along the nearest face by `pad` metres so it ends up outside.
         */
        _clearOfBuildings(p, pad) {
            const rects = this.buildingRects;
            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                if (p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad) {
                    const dxl = p.x - (r.x0 - pad), dxr = (r.x1 + pad) - p.x;
                    const dzl = p.z - (r.z0 - pad), dzr = (r.z1 + pad) - p.z;
                    const m = Math.min(dxl, dxr, dzl, dzr);
                    if (m === dxl) p.x = r.x0 - pad - 0.01;
                    else if (m === dxr) p.x = r.x1 + pad + 0.01;
                    else if (m === dzl) p.z = r.z0 - pad - 0.01;
                    else p.z = r.z1 + pad + 0.01;
                }
            }
            return p;
        }

        _insidePropExclusion(x, z, pad = 0) {
            for (const r of this.propExclusionRects || []) {
                if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
            }
            return false;
        }

        // ---- ground -------------------------------------------------------------
        _buildGround() {
            // Water plane with fine wave tessellation (128x128 quads for realistic waves)
            const waterGeo = new THREE.PlaneGeometry(
                WORLD.MAX_X - WORLD.MIN_X + 600,
                WORLD.MAX_Z - WORLD.MIN_Z + 600,
                128, 128
            );
            waterGeo.rotateX(-Math.PI / 2);
            const water = new THREE.Mesh(waterGeo, this.mat.water);
            water.position.set((WORLD.MIN_X + WORLD.MAX_X) / 2, -0.4, (WORLD.MIN_Z + WORLD.MAX_Z) / 2);
            this.root.add(water);
            this.landMeshes.push(water);

            // Land polygons with a stone seawall skirt + natural shoreline
            // dressing (sand wash, riprap rocks, grass tufts) so the waterline
            // never reads as a single ruled line. Deterministic rng: the same
            // island every session.
            const shoreRng = mulberry32(77031);
            const landPolys = [
                { poly: ISLAND, mat: this.mat.land, c: [580, 1690] },
                { poly: BROOKLYN_POLY, mat: this.mat.land, c: [(BROOKLYN.x1 + BROOKLYN.x2) / 2, (BROOKLYN.z1 + BROOKLYN.z2) / 2] },
                { poly: STATUE_POLY, mat: this.mat.land, c: [STATUE.x, STATUE.z] },
            ];
            if (typeof PARADISE_SOUTH_POLY !== 'undefined') {
                landPolys.push({ poly: PARADISE_SOUTH_POLY, mat: this.mat.land, c: [-780, 2195] });
            }
            if (typeof QUEENS_POLY !== 'undefined') {
                landPolys.push({ poly: QUEENS_POLY, mat: this.mat.land, c: [(QUEENS.x1 + QUEENS.x2) / 2, (QUEENS.z1 + QUEENS.z2) / 2] });
            }
            if (typeof VICE_SHORES_POLY !== 'undefined') {
                landPolys.push({ poly: VICE_SHORES_POLY, mat: this.mat.land, c: [(VICE_SHORES.x1 + VICE_SHORES.x2) / 2, (VICE_SHORES.z1 + VICE_SHORES.z2) / 2] });
            }
            if (typeof GOVERNORS_POLY !== 'undefined') {
                landPolys.push({ poly: GOVERNORS_POLY, mat: this.mat.land, c: [(GOVERNORS.x1 + GOVERNORS.x2) / 2, (GOVERNORS.z1 + GOVERNORS.z2) / 2] });
            }
            for (const { poly, mat, c: dressC } of landPolys) {
                const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p[0], -p[1])));
                const g = new THREE.ShapeGeometry(shape);
                const m = new THREE.Mesh(g, mat);
                m.rotation.x = -Math.PI / 2;
                m.position.y = 0.00;
                m.receiveShadow = true;
                this.root.add(m);
                this.landMeshes.push(m);
                // Seawall skirt from land level down into the water, tone
                // varied per segment so long runs don't read as one flat band.
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const [xi, zi] = poly[i], [xj, zj] = poly[j];
                    this.fquad(
                        [xi, 0.00, zi], [xj, 0.00, zj], [xj, -0.80, zj], [xi, -0.80, zi],
                        [0, 1, 0], tintJitter(col3(0x5e5648), shoreRng, 0.07)
                    );
                }
                // Shoreline dressing straddling the waterline.
                const sand = col3(0xc2b280), rock = col3(0x6e6a62), rockD = col3(0x54514b);
                const grass = col3(0x5d8a42);
                let carry = 6 + shoreRng() * 8;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
                    const ex = bx - ax, ez = bz - az;
                    const elen = Math.sqrt(ex * ex + ez * ez);
                    if (elen < 1e-6) continue;
                    const ux = ex / elen, uz = ez / elen;
                    let nx = uz, nz = -ux;
                    if (((ax + bx) / 2 - dressC[0]) * nx + ((az + bz) / 2 - dressC[1]) * nz < 0) { nx = -nx; nz = -nz; }
                    let d = carry;
                    while (d < elen) {
                        const px = ax + ux * d, pz = az + uz * d;
                        const r = shoreRng();
                        if (r < 0.42) {
                            this.fdisc(px + nx * 2.5, 0.03, pz + nz * 2.5, 2.5 + shoreRng() * 2.5, 9, tintJitter(sand, shoreRng, 0.06), true);
                        } else if (r < 0.78) {
                            const rs = 1.2 + shoreRng() * 2.2;
                            this.fbox(px + nx * (1 + shoreRng() * 2), -0.1 + rs * 0.28, pz + nz * (1 + shoreRng() * 2),
                                rs, rs * 0.75, rs * (0.8 + shoreRng() * 0.5), tintJitter(shoreRng() < 0.5 ? rock : rockD, shoreRng, 0.09));
                        } else {
                            this.fdisc(px - nx * 2.5, 0.06, pz - nz * 2.5, 1.4 + shoreRng() * 1.6, 8, tintJitter(grass, shoreRng, 0.10), true);
                        }
                        d += 9 + shoreRng() * 10;
                    }
                    carry = d - elen;
                }
            }
            // Park grounds (rects) sit safely above land (roads run at 0.10).
            for (const [x1, z1, x2, z2] of PARKS) {
                const park = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), this.mat.park);
                park.rotation.x = -Math.PI / 2;
                park.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
                park.receiveShadow = true;
                this.root.add(park);
                this.landMeshes.push(park);
            }
            // Brooklyn gets its own ground tone + piers along the river edge.
            for (let z = BROOKLYN.z1 + 30; z < BROOKLYN.z2 - 20; z += 90) {
                this.fbox(BROOKLYN.x1 - 14, 0.6, z, 16, 1.2, 44, col3(0x6a5238));
            }
            if (typeof PARADISE !== 'undefined') {
                this._buildParadiseHills();
            }
        }

        // ---- roads -----------------------------------------------------------------
        /** Horizontal surface quad along a segment (any orientation). */
        _roadQuad(ax, az, bx, bz, width, y, color) {
            const dx = bx - ax, dz = bz - az;
            const len = Math.sqrt(dx * dx + dz * dz);
            const px = (dz / len) * width / 2, pz = (-dx / len) * width / 2;
            this.fquad(
                [ax - px, y, az - pz], [bx - px, y, bz - pz],
                [bx + px, y, bz + pz], [ax + px, y, az + pz],
                [0, 1, 0], color
            );
        }
        /** Thin flat marking strip along a segment. */
        _markQuad(ax, az, bx, bz, width, y, color) {
            this._roadQuad(ax, az, bx, bz, width, y, color);
        }

        _buildRoads() {
            const rng = mulberry32(4242);
            for (const seg of this.map.segments) {
                // Bridges have their own custom elevated decks/cables; skip ground road
                if (seg.bridge) continue;

                const y = WORLD.GROUND_Y - 0.02;
                const diag = seg.dir === 'diag';
                const ax = seg.ax, az = seg.az, bx = seg.bx, bz = seg.bz;
                const len = diag ? Math.hypot(bx - ax, bz - az) : (seg.dir === 'ns' ? (bz - az) : (bx - ax));
                if (len <= 0) continue;

                // 1. Asphalt surface
                if (diag) {
                    this._roadQuad(ax, az, bx, bz, seg.width, y, tintJitter(ROAD_COLOR, rng, 0.06));
                } else {
                    const dxn = seg.dir === 'ns' ? 0 : 1, dzn = seg.dir === 'ns' ? 1 : 0;
                    for (let s = 0; s < len; s += 28) {
                        const e = Math.min(s + 28, len);
                        const p0x = ax + dxn * s, p0z = az + dzn * s;
                        const p1x = ax + dxn * e, p1z = az + dzn * e;
                        this._roadQuad(p0x, p0z, p1x, p1z, seg.width, y, tintJitter(ROAD_COLOR, rng, 0.06));
                    }
                }

                // 2. Compute intersection cut intervals along this segment
                const halfW = seg.width / 2;
                const cuts = [];
                const onSeg = this.map.nodes.filter(n => {
                    if (seg.dir === 'ns') return n.z >= az - 1 && n.z <= bz + 1 && Math.abs(n.x - seg.x) < 2;
                    if (seg.dir === 'ew') return n.x >= ax - 1 && n.x <= bx + 1 && Math.abs(n.z - seg.z) < 2;
                    if (diag) {
                        const dx = bx - ax, dz = bz - az;
                        const t = ((n.x - ax) * dx + (n.z - az) * dz) / (len * len);
                        if (t < -0.01 || t > 1.01) return false;
                        const px = ax + dx * t, pz = az + dz * t;
                        return dist2(n.x, n.z, px, pz) < 6;
                    }
                    return false;
                });

                for (const node of onSeg) {
                    let crossW = 10;
                    if (seg.dir === 'ns') {
                        crossW = (node.ew ? node.ew.width : (node.diag ? node.diag.width : 10));
                        const d = crossW / 2 + 0.6;
                        cuts.push([node.z - az - d, node.z - az + d]);
                    } else if (seg.dir === 'ew') {
                        crossW = (node.ns ? node.ns.width : (node.diag ? node.diag.width : 12));
                        const d = crossW / 2 + 0.6;
                        cuts.push([node.x - ax - d, node.x - ax + d]);
                    } else if (diag) {
                        crossW = (node.ns ? node.ns.width : (node.ew ? node.ew.width : 12));
                        const dx = bx - ax, dz = bz - az;
                        const t = ((node.x - ax) * dx + (node.z - az) * dz) / (len * len);
                        const distAlong = t * len;
                        const d = crossW / 2 + 0.8;
                        cuts.push([distAlong - d, distAlong + d]);
                    }
                }

                // Also check Broadway diagonal corridor crossing for orthogonal segments
                if (!diag) {
                    if (seg.dir === 'ns') {
                        for (let bIdx = 0; bIdx < BROADWAY.length - 1; bIdx++) {
                            const [bax, baz] = BROADWAY[bIdx], [bbx, bbz] = BROADWAY[bIdx + 1];
                            const minX = Math.min(bax, bbx), maxX = Math.max(bax, bbx);
                            if (seg.x >= minX - 1 && seg.x <= maxX + 1) {
                                const t = (seg.x - bax) / (bbx - bax || 1);
                                const bzCross = baz + (bbz - baz) * t;
                                if (bzCross >= az && bzCross <= bz) {
                                    const d = BROADWAY_W / 2 + 1.2;
                                    cuts.push([bzCross - az - d, bzCross - az + d]);
                                }
                            }
                        }
                    } else if (seg.dir === 'ew') {
                        const bX = broadwayXAt(seg.z);
                        if (bX !== null && bX >= ax - 2 && bX <= bx + 2) {
                            const d = BROADWAY_W / 2 + 1.5;
                            cuts.push([bX - ax - d, bX - ax + d]);
                        }
                    }
                }

                // Sort and merge cuts
                cuts.sort((p, q) => p[0] - q[0]);
                const mergedCuts = [];
                for (const c of cuts) {
                    const c0 = Math.max(0, c[0]), c1 = Math.min(len, c[1]);
                    if (c1 <= c0) continue;
                    if (!mergedCuts.length || mergedCuts[mergedCuts.length - 1][1] < c0) {
                        mergedCuts.push([c0, c1]);
                    } else {
                        mergedCuts[mergedCuts.length - 1][1] = Math.max(mergedCuts[mergedCuts.length - 1][1], c1);
                    }
                }

                // Invert cuts to get block spans [start, end]
                const spans = [];
                let cur = 0;
                for (const [c0, c1] of mergedCuts) {
                    if (c0 > cur + 1.5) spans.push([cur, c0]);
                    cur = Math.max(cur, c1);
                }
                if (cur < len - 1.5) spans.push([cur, len]);

                // 3. Draw curbs and markings within valid block spans
                for (const [s0, s1] of spans) {
                    const spanLen = s1 - s0;
                    if (spanLen < 2.0) continue;

                    // Curbs along the sidewalk edge
                    if (diag) {
                        const dx = (bx - ax) / len, dz = (bz - az) / len;
                        const nx = -dz, nz = dx;
                        const p0x = ax + dx * s0, p0z = az + dz * s0;
                        const p1x = ax + dx * s1, p1z = az + dz * s1;
                        const lx0 = p0x + nx * (halfW + 0.2), lz0 = p0z + nz * (halfW + 0.2);
                        const lx1 = p1x + nx * (halfW + 0.2), lz1 = p1z + nz * (halfW + 0.2);
                        this._roadQuad(lx0, lz0, lx1, lz1, 0.4, y + 0.02, CURB_COLOR);
                        const rx0 = p0x - nx * (halfW + 0.2), rz0 = p0z - nz * (halfW + 0.2);
                        const rx1 = p1x - nx * (halfW + 0.2), rz1 = p1z - nz * (halfW + 0.2);
                        this._roadQuad(rx0, rz0, rx1, rz1, 0.4, y + 0.02, CURB_COLOR);
                    } else {
                        const along = seg.dir === 'ns';
                        if (along) {
                            const zmid = az + (s0 + s1) / 2;
                            this.fbox(ax - halfW - 0.2, 0.08, zmid, 0.4, 0.16, spanLen, CURB_COLOR);
                            this.fbox(ax + halfW + 0.2, 0.08, zmid, 0.4, 0.16, spanLen, CURB_COLOR);
                        } else {
                            const xmid = ax + (s0 + s1) / 2;
                            this.fbox(xmid, 0.08, az - halfW - 0.2, spanLen, 0.16, 0.4, CURB_COLOR);
                            this.fbox(xmid, 0.08, az + halfW + 0.2, spanLen, 0.16, 0.4, CURB_COLOR);
                        }
                    }

                    // Center Markings (keep 3.5m back from intersection crosswalks)
                    const markMargin = Math.min(4.0, spanLen * 0.25);
                    const ms0 = s0 + markMargin, ms1 = s1 - markMargin;
                    if (ms1 > ms0 + 1.5) {
                        if (seg.oneway === null) {
                            // Two-way: double yellow lines
                            if (diag) {
                                const dx = (bx - ax) / len, dz = (bz - az) / len;
                                const p0x = ax + dx * ms0, p0z = az + dz * ms0;
                                const p1x = ax + dx * ms1, p1z = az + dz * ms1;
                                this._markQuad(p0x, p0z, p1x, p1z, 0.35, y + 0.015, YELLOW_COLOR);
                            } else if (seg.dir === 'ns') {
                                this._markQuad(ax - 0.16, az + ms0, ax - 0.16, az + ms1, 0.12, y + 0.015, YELLOW_COLOR);
                                this._markQuad(ax + 0.16, az + ms0, ax + 0.16, az + ms1, 0.12, y + 0.015, YELLOW_COLOR);
                            } else if (seg.dir === 'ew') {
                                this._markQuad(ax + ms0, az - 0.16, ax + ms1, az - 0.16, 0.12, y + 0.015, YELLOW_COLOR);
                                this._markQuad(ax + ms0, az + 0.16, ax + ms1, az + 0.16, 0.12, y + 0.015, YELLOW_COLOR);
                            }
                        } else {
                            // One-way: white dashed markings
                            const dashLen = 4, gapLen = 5;
                            for (let p = ms0; p < ms1; p += (dashLen + gapLen)) {
                                const pe = Math.min(p + dashLen, ms1);
                                if (seg.dir === 'ns') {
                                    this._markQuad(ax, az + p, ax, az + pe, 0.14, y + 0.015, MARK_COLOR);
                                } else if (seg.dir === 'ew') {
                                    this._markQuad(ax + p, az, ax + pe, az, 0.14, y + 0.015, MARK_COLOR);
                                }
                            }
                        }
                    }
                }

                // Manholes in block spans
                if (!seg.bridge && rng() < 0.8 && len > 50) {
                    const count = Math.floor(len / 60);
                    for (let k = 0; k < count; k++) {
                        const t = (k + 0.5) / count;
                        const mx = ax + (bx - ax) * t + (rng() - 0.5) * halfW * 0.5;
                        const mz = az + (bz - az) * t + (rng() - 0.5) * halfW * 0.5;
                        this.fdisc(mx, y + 0.012, mz, 0.42, 8, col3(0x22242a), true);
                    }
                }
            }
            // Crosswalks + stop lines at every intersection with crossings.
            const builtCrosswalks = new Set();
            for (const n of this.map.nodes) {
                const nsSeg = n.ns || n.diag;
                const ewSeg = n.ew;
                if (!nsSeg || !ewSeg || nsSeg.bridge || ewSeg.bridge) continue;
                const key = Math.round(n.x) + '|' + Math.round(n.z);
                if (builtCrosswalks.has(key)) continue;
                builtCrosswalks.add(key);
                this._buildCrosswalk(n.x, n.z, nsSeg.width, ewSeg.width);
            }
        }

        _buildCrosswalk(x, z, nsWidth = 14, ewWidth = 14) {
            const y = (WORLD.GROUND_Y || 0.12) + 0.015;
            // Place stripes across each approach based on actual intersecting road widths
            const dZ = ewWidth * 0.5 + 0.8;
            const dX = nsWidth * 0.5 + 0.8;
            const w = 1.0;
            // North + South approaches (across Avenue, stripes run N-S, walk E-W)
            const countX = Math.max(3, Math.floor((nsWidth - 2) / 1.6));
            const halfX = Math.floor(countX / 2);
            for (let i = -halfX; i <= halfX; i++) {
                const off = i * 1.5;
                // North crosswalk
                this.fquad([x + off - w / 2, y, z - dZ - 2.2], [x + off - w / 2, y, z - dZ],
                    [x + off + w / 2, y, z - dZ], [x + off + w / 2, y, z - dZ - 2.2], [0, 1, 0], MARK_COLOR);
                // South crosswalk
                this.fquad([x + off - w / 2, y, z + dZ], [x + off - w / 2, y, z + dZ + 2.2],
                    [x + off + w / 2, y, z + dZ + 2.2], [x + off + w / 2, y, z + dZ], [0, 1, 0], MARK_COLOR);
            }
            // East + West approaches (across Street, stripes run E-W, walk N-S)
            const countZ = Math.max(3, Math.floor((ewWidth - 2) / 1.6));
            const halfZ = Math.floor(countZ / 2);
            for (let i = -halfZ; i <= halfZ; i++) {
                const off = i * 1.5;
                // West crosswalk
                this.fquad([x - dX - 2.2, y, z + off - w / 2], [x - dX, y, z + off - w / 2],
                    [x - dX, y, z + off + w / 2], [x - dX - 2.2, y, z + off + w / 2], [0, 1, 0], MARK_COLOR);
                // East crosswalk
                this.fquad([x + dX, y, z + off - w / 2], [x + dX + 2.2, y, z + off - w / 2],
                    [x + dX + 2.2, y, z + off + w / 2], [x + dX, y, z + off + w / 2], [0, 1, 0], MARK_COLOR);
            }
        }

        // ---- buildings -------------------------------------------------------------
        /**
         * Core building emitter: textured walls (baked UV repeat), gravel roof
         * slab, parapet, collider, optional storefront band / cornice / stoop /
         * water tower / roof bulkhead.
         */
        _building(x0, z0, x1, z1, h, style, tint, opts) {
            opts = opts || {};
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            // Road guard: nothing may be massed on top of a driving lane. Block
            // derivation already keeps lots off the asphalt, so a hit here means
            // a hand-placed landmark is misaligned — counted so the headless
            // harness can assert it stays zero instead of failing silently.
            if (opts.roadGuard !== false && this.map && this.map.segments) {
                const bk = cx >= BROOKLYN.x1 && cx <= BROOKLYN.x2 && cz >= BROOKLYN.z1 && cz <= BROOKLYN.z2;
                if (!rectClearOfRoads(this.map.segments, x0, z0, x1, z1, bk)) {
                    this.roadGuardSkips.push({ x: cx, z: cz, w: x1 - x0, d: z1 - z0, h });
                    return;
                }
            }
            this._markBuilding(x0, z0, x1, z1);
            const sx = x1 - x0, sz = z1 - z0;
            const y0 = opts.y0 !== undefined ? opts.y0 : 0.00;
            // Ground-floor retail band (slightly outset so it reads as depth).
            if (opts.storefront) {
                this._facadeBatch('storefront', cx, cz).box(
                    cx, y0 + 1.6, cz, sx + 0.24, 3.2, sz + 0.24, tint,
                    { uvTile: [TILE_W, 3.2] }
                );
            }
            const wallY0 = y0 + (opts.storefront ? 3.0 : 0);
            const wallH = h - (opts.storefront ? 3.0 : 0);
            this._facadeBatch(style, cx, cz).box(
                cx, wallY0 + wallH / 2, cz, sx, wallH, sz, tint,
                { uvTile: [TILE_W, TILE_H], noTop: true, noBottom: true }
            );
            // Gravel roof slab.
            this._facadeBatch('roof', cx, cz).box(cx, y0 + h + 0.15, cz, sx, 0.3, sz, [1, 1, 1],
                { uvTile: [TILE_W, TILE_W] });
            // Parapet lip on low buildings; cornice band for pre-war styles.
            if (opts.cornice) {
                const c = [tint[0] * 0.55, tint[1] * 0.55, tint[2] * 0.55];
                this.fbox(cx, y0 + h + 0.55, cz, sx + 0.9, 0.8, sz + 0.9, c);
            } else if (h < 60) {
                const c = col3(0x8f8a7e);
                this.fbox(cx, y0 + h + 0.35, z0 + 0.25, sx, 0.5, 0.4, c);
                this.fbox(cx, y0 + h + 0.35, z1 - 0.25, sx, 0.5, 0.4, c);
                this.fbox(x0 + 0.25, y0 + h + 0.35, cz, 0.4, 0.5, sz, c);
                this.fbox(x1 - 0.25, y0 + h + 0.35, cz, 0.4, 0.5, sz, c);
            }
            // Brownstone stoop (front steps + railings) on the given face.
            if (opts.stoop) {
                const stepC = col3(0x9a9285), railC = col3(0x3a3a40);
                const face = opts.stoop; // 'n' | 's' | 'e' | 'w'
                const nSteps = 5, rise = 1.5, run = 2.8;
                for (let i = 0; i < nSteps; i++) {
                    const sy = (rise / nSteps) * (i + 0.5);
                    const depth = run * (1 - i / nSteps) + 0.4;
                    if (face === 'n' || face === 's') {
                        const sz2 = 3.6;
                        const pz = face === 'n' ? z0 - run / 2 + run * (i / nSteps) - 0.001 : z1 + run / 2 - run * (i / nSteps) + 0.001;
                        this.fbox(cx, sy / 2 + 0.1, pz, sz2, sy + 0.16, depth, stepC);
                    } else {
                        const sx2 = 3.6;
                        const px = face === 'w' ? x0 - run / 2 + run * (i / nSteps) - 0.001 : x1 + run / 2 - run * (i / nSteps) + 0.001;
                        this.fbox(px, sy / 2 + 0.1, cz, depth, sy + 0.16, sx2, stepC);
                    }
                }
                // Simple side rails.
                if (face === 'n' || face === 's') {
                    const pz = face === 'n' ? z0 - run / 2 : z1 + run / 2;
                    this.fbox(cx - 1.9, rise / 2 + 0.2, pz, 0.12, rise, 0.12, railC);
                    this.fbox(cx + 1.9, rise / 2 + 0.2, pz, 0.12, rise, 0.12, railC);
                } else {
                    const px = face === 'w' ? x0 - run / 2 : x1 + run / 2;
                    this.fbox(px, rise / 2 + 0.2, cz - 1.9, 0.12, rise, 0.12, railC);
                    this.fbox(px, rise / 2 + 0.2, cz + 1.9, 0.12, rise, 0.12, railC);
                }
            }
            // Rooftop water tower (wood tank on legs).
            if (opts.waterTower) {
                const wx = cx + (sx / 4) * (opts.wtDx || 0.4), wz = cz + (sz / 4) * (opts.wtDz || -0.3);
                const top = y0 + h + 0.3;
                const wood = col3(0x8a6844), dark = col3(0x5e4630);
                for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
                    this.fbox(wx + ox, top + 0.6, wz + oz, 0.18, 1.2, 0.18, dark);
                }
                this.fcyl(wx, top + 1.2 + 1.1, wz, 1.15, 1.0, 2.2, 10, wood);
                this.fcyl(wx, top + 1.2 + 2.2 + 0.45, wz, 1.3, 0.15, 0.9, 10, dark);
            }
            // Roof bulkhead / stairhouse.
            if (opts.bulkhead !== false && h >= 9) {
                const bc = tintJitter(col3(0x9a948a), this._bkRng, 0.08);
                this.fbox(cx + (opts.bhDx || 0) * sx * 0.2, y0 + h + 1.0, cz + (opts.bhDz || 0) * sz * 0.2,
                    Math.min(sx * 0.3, 4), 1.6, Math.min(sz * 0.3, 4), bc);
            }
            if (!opts.noCollide) this._collide(cx, y0 + h / 2, cz, sx, h, sz);
        }

        /** Setback tower: stepped massing (midtown skyscraper). */
        _setbackTower(x0, z0, x1, z1, rng, tint) {
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const style = pick(['glassBlue', 'glassTeal', 'deco', 'brickRed'], rng);
            const t = tintJitter(tint, rng, 0.1);
            const w = x1 - x0, d = z1 - z0;
            const h0 = 15 + rng() * 12;                 // podium
            const h1 = h0 + 14 + rng() * 16;            // mid section
            const h2 = h1 + 18 + rng() * 40;            // tower
            const spire = rng() < 0.35;
            this._building(x0, z0, x1, z1, h0, style, t, { storefront: true, cornice: style === 'deco' });
            const k1 = 0.78;
            this._building(
                x0 + w * (1 - k1) / 2, z0 + d * (1 - k1) / 2, x1 - w * (1 - k1) / 2, z1 - d * (1 - k1) / 2,
                h1, style, t, { y0: h0, noCollide: true, bulkhead: false }
            );
            const k2 = 0.52;
            this._building(
                x0 + w * (1 - k2) / 2, z0 + d * (1 - k2) / 2, x1 - w * (1 - k2) / 2, z1 - d * (1 - k2) / 2,
                h2, style, t, { y0: h1, noCollide: true, bulkhead: false }
            );
            if (spire) {
                this.fcyl(cx, h2 + 4, cz, 0.6, 0.15, 8, 8, col3(0xb8bcc4));
            }
        }

        // ---- district grammars ---------------------------------------------------
        /** Split a rect into row lots along its longer axis. */
        _rowLots(x0, z0, x1, z1, minW, maxW, rng) {
            const lots = [];
            const along = (x1 - x0) >= (z1 - z0);
            const lo = along ? x0 : z0, hi = along ? x1 : z1;
            let p = lo;
            while (p < hi - minW) {
                let w = minW + rng() * (maxW - minW);
                if (p + w > hi - minW * 0.6) w = hi - p;
                if (w < minW * 0.7) break;
                const gap = rng() < 0.15 ? 0.8 : 0;
                if (along) lots.push([p, z0, p + w - gap, z1]);
                else lots.push([x0, p, x1, p + w - gap]);
                p += w;
            }
            return lots;
        }
        _lotBlockedByLandmark(x0, z0, x1, z1) {
            for (const lm of LANDMARKS) {
                if (x1 > lm.x1 - 2 && x0 < lm.x2 + 2 && z1 > lm.z1 - 2 && z0 < lm.z2 + 2) return true;
            }
            // Any road corridor (Broadway's diagonal included) blocks the lot.
            const bk = x0 >= BROOKLYN.x1 && x1 <= BROOKLYN.x2 && z0 >= BROOKLYN.z1 && z1 <= BROOKLYN.z2;
            return !rectClearOfRoads(this.map.segments, x0, z0, x1, z1, bk, 0.8);
        }

        _placeHouse(key, lx0, lz0, lx1, lz1, face, maxScale, setback) {
            const def = this.houseDefs[key];
            if (!def) return false;
            const rots = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };
            const bx = face === 'w' ? 1 : face === 'e' ? -1 : 0;
            const bz = face === 'n' ? 1 : face === 's' ? -1 : 0;
            const ry = rots[face];
            const quarter = Math.round(Math.abs(ry) / (Math.PI / 2)) & 1;
            const ew = quarter ? def.d : def.w, ed = quarter ? def.w : def.d;
            const availW = (lx1 - lx0) - 2, availD = (lz1 - lz0) - 2;
            if (availW < 4 || availD < 4) return false;
            const s = Math.min(availW / ew, availD / ed, maxScale || 1.15);
            if (ew * s < 4) return false;
            const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
            const sb = typeof setback === 'number' ? setback : 0.18;
            const hx = cx + bx * Math.max(0, lx1 - lx0 - ew * s) * sb;
            const hz = cz + bz * Math.max(0, lz1 - lz0 - ed * s) * sb;
            (this.houseSpots[key] = this.houseSpots[key] || []).push({ x: hx, z: hz, ry, s });
            this._markBuilding(hx - ew * s / 2, hz - ed * s / 2, hx + ew * s / 2, hz + ed * s / 2);
            const finalH = def.h * s;
            this._collide(hx, 0.07 + finalH / 2, hz, ew * s, finalH, ed * s);
            return true;
        }

        _placeBuilding(key, lx0, lz0, lx1, lz1, face, targetHeight) {
            const def = this.buildingDefs[key];
            if (!def) return false;
            const rots = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };
            const ry = rots[face] || 0;
            const quarter = Math.round(Math.abs(ry) / (Math.PI / 2)) & 1;
            const ew = quarter ? def.d : def.w, ed = quarter ? def.w : def.d;
            const lotW = lx1 - lx0, lotD = lz1 - lz0;
            if (lotW < 6 || lotD < 6) return false;
            const availW = Math.max(4, lotW - 1.0), availD = Math.max(4, lotD - 1.0);
            const sHoriz = Math.min(availW / ew, availD / ed, 1.4);
            if (sHoriz <= 0.05) return false;
            const sW = ew * sHoriz, sD = ed * sHoriz;
            let sY = sHoriz;
            if (targetHeight && targetHeight > 10) sY = clamp(targetHeight / def.h, 0.4, 2.5);
            const sH = def.h * sY;
            const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
            // Road clearance check: ensure this building never impinges on any road lane
            if (this.map && this.map.segments) {
                const colW = sW / 2, colD = sD / 2;
                for (let s = 0; s < this.map.segments.length; s++) {
                    const seg = this.map.segments[s];
                    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
                    const lenSq = dx * dx + dz * dz;
                    let t = lenSq === 0 ? 0 : ((cx - seg.ax) * dx + (cz - seg.az) * dz) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                    const nx = seg.ax + t * dx, nz = seg.az + t * dz;
                    const d = Math.hypot(cx - nx, cz - nz);
                    if (d < seg.width / 2 + Math.min(colW, colD) + 0.2) return false;
                }
            }
            (this.buildingSpots[key] = this.buildingSpots[key] || []).push({
                x: cx, z: cz, ry, sx: sHoriz, sy: sY, sz: sHoriz,
            });
            this._markBuilding(cx - sW / 2, cz - sD / 2, cx + sW / 2, cz + sD / 2);
            this._collide(cx, sH / 2 + 0.05, cz, sW, sH, sD);
            if (sH >= 15 && sW >= 10 && sD >= 10) {
                const seed = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233));
                if (seed > 0.62) {
                    this.propSpots.waterTowers.push({
                        x: cx + (seed * 2 - 1) * (sW * 0.22),
                        y: sH + 0.05,
                        z: cz + ((seed * 3.7) % 1 * 2 - 1) * (sD * 0.22),
                        ry: seed * Math.PI * 2,
                        s: 1.0,
                    });
                }
                if (seed < 0.68) {
                    this.propSpots.rooftopAcUnits.push({
                        x: cx - (seed * 2 - 1) * (sW * 0.20),
                        y: sH + 0.05,
                        z: cz - ((seed * 2.3) % 1 * 2 - 1) * (sD * 0.20),
                        ry: Math.floor(seed * 4) * (Math.PI / 2),
                        s: 1.0,
                    });
                }
            }
            return true;
        }

        /** Pick a random key from a candidate list, keeping only keys whose GLB actually loaded. */
        _pick(list, rng) {
            const avail = list.filter((k) => this.buildingDefs[k]);
            return avail.length ? avail[Math.floor(rng() * avail.length)] : null;
        }

        fillBlock(block) {
            const rng = mulberry32(block.seed);
            let g = block.grammar;
            // When the optional house pack is present, a generous share of Brooklyn
            // and residential blocks become suburban residential streets instead.
            if (Object.keys(this.houseDefs).length) {
                if (block.bk && (g === 'warehouse' || g === 'residential') && block.seed % 10 < 7) {
                    g = 'residential';
                } else if (!block.bk && block.z1 < 800 && (g === 'warehouse' || g === 'residential') && block.seed % 10 < 3) {
                    g = 'residential';
                }
            }
            this._bkRng = rng;
            // Usable lot area (sidewalk margin).
            const m = 2.5;
            const x0 = block.x1 + m, z0 = block.z1 + m, x1 = block.x2 - m, z1 = block.z2 - m;
            const w = x1 - x0, d = z1 - z0;
            if (w < 6 || d < 6) return;
            const along = w >= d;
            const face = along ? (rng() < 0.5 ? 'n' : 's') : (rng() < 0.5 ? 'w' : 'e');

            const lotsOf = (minW, maxW) => this._rowLots(x0, z0, x1, z1, minW, maxW, rng);
            const hasUrban = Object.keys(this.buildingDefs).length > 0;

            switch (g) {
                case 'brownstone': {
                    const hasBrownstoneGLB = !!this.houseDefs.townhouse_brownstone;
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(11, 16)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasBrownstoneGLB && rng() < 0.65) {
                            if (this._placeHouse('townhouse_brownstone', lx0, lz0, lx1, lz1, face, 1.1, 0.12)) {
                                continue;
                            }
                        }
                        if (hasUrban) {
                            const bkey = this._pick(['building_tenement', 'building_castiron', 'library_civic', 'school_public'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 14 + rng() * 6)) continue;
                        }
                        const floors = 3 + Math.floor(rng() * 2);
                        const style = rng() < 0.5 ? 'brownstone' : 'brickRed';
                        const tint = tintJitter(col3(style === 'brownstone' ? 0x6e4a33 : 0x9a5a42), rng, 0.12);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, style, tint, {
                            stoop: face, cornice: true, waterTower: false,
                        });
                    }
                    this._edgeTrees(block, rng, 0.55);
                    break;
                }
                case 'rowhouse': {
                    const rowhousePool = ['victorian_queen', 'duplex_mirror', 'colonial_brick', 'craftsman_bungalow', 'colonial_white', 'tudor_cottage', 'brick_townhouse_2', 'cape_cod', 'bungalow_modern', 'split_level_ranch'].filter(k => this.houseDefs[k]);
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(13, 19)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (rowhousePool.length && rng() < 0.55) {
                            const chosenKey = rowhousePool[Math.floor(rng() * rowhousePool.length)];
                            if (this._placeHouse(chosenKey, lx0, lz0, lx1, lz1, face, 1.1, 0.15)) {
                                continue;
                            }
                        }
                        if (hasUrban) {
                            const bkey = this._pick(['building_tenement', 'building_commercial', 'department_store', 'library_civic'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 12 + rng() * 6)) continue;
                        }
                        const floors = 2 + Math.floor(rng() * 2);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'brickRed',
                            tintJitter(col3(0xa86a4d), rng, 0.14), { stoop: face, cornice: true });
                    }
                    this._edgeTrees(block, rng, 0.5);
                    break;
                }
                case 'tenement': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(14, 20)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['building_tenement', 'building_castiron', 'school_public', 'library_civic'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 18 + rng() * 8)) continue;
                        }
                        const floors = 5 + Math.floor(rng() * 2);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'brickTenement',
                            tintJitter(col3(0x9a6a50), rng, 0.14), {
                                storefront: rng() < 0.5, cornice: true,
                                waterTower: floors >= 6 && rng() < 0.35,
                            });
                    }
                    this._edgeTrees(block, rng, 0.18);
                    break;
                }
                case 'limestone': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(15, 22)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['tower_prewar', 'building_commercial', 'building_castiron', 'bank_capital', 'gov_cityhall', 'library_civic'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 20 + rng() * 12)) continue;
                        }
                        const floors = 4 + Math.floor(rng() * 3);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'limestone',
                            tintJitter(col3(0xd9c9a3), rng, 0.06), { cornice: true });
                    }
                    this._edgeTrees(block, rng, 0.5);
                    break;
                }
                case 'prewar': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(24, 36)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['tower_prewar', 'tower_setback', 'building_commercial', 'hotel_tower', 'bank_capital'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 35 + rng() * 20)) continue;
                        }
                        const floors = 8 + Math.floor(rng() * 6);
                        const style = rng() < 0.5 ? 'brickRed' : 'limestone';
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, style,
                            tintJitter(col3(style === 'brickRed' ? 0x9d5f48 : 0xd9c9a3), rng, 0.08), {
                                cornice: true, waterTower: rng() < 0.4,
                            });
                    }
                    this._edgeTrees(block, rng, 0.4);
                    break;
                }
                case 'residential': {
                    // GLB suburban houses on generous lots, front yards +
                    // walkways toward the street, leafy edges.
                    const keys = Object.keys(this.houseDefs);
                    const rots = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };
                    // "Back" direction: away from the street the lot faces.
                    const bx = face === 'w' ? 1 : face === 'e' ? -1 : 0;
                    const bz = face === 'n' ? 1 : face === 's' ? -1 : 0;
                    const path = col3(0x9d9d96);
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(19, 28)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (keys.length > 0) {
                            const key = keys[Math.floor(rng() * keys.length)];
                            const def = this.houseDefs[key];
                            const ry = rots[face];
                            const quarter = Math.round(Math.abs(ry) / (Math.PI / 2)) & 1;
                            const ew = quarter ? def.d : def.w, ed = quarter ? def.w : def.d;
                            const availW = (lx1 - lx0) - 4, availD = (lz1 - lz0) - 4;
                            if (availW >= 6 && availD >= 6) {
                                const s = Math.min(availW / ew, availD / ed, 1.2);
                                if (ew * s >= 6) {
                                    const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
                                    const hx = cx + bx * (lx1 - lx0 - ew * s) * 0.24;
                                    const hz = cz + bz * (lz1 - lz0 - ed * s) * 0.24;
                                    (this.houseSpots[key] = this.houseSpots[key] || []).push({ x: hx, z: hz, ry, s });
                                    const finalH = def.h * s;
                                    this._collide(hx, 0.07 + finalH / 2, hz, ew * s, finalH, ed * s);
                                    if (bx === 0) {
                                        const zf = hz - bz * (ed * s / 2), ze = bz > 0 ? lz1 : lz0;
                                        this.fbox(hx, 0.09, (zf + ze) / 2, 1.4, 0.06, Math.max(0.6, Math.abs(ze - zf)), path);
                                    } else {
                                        const xf = hx - bx * (ew * s / 2), xe = bx > 0 ? lx1 : lx0;
                                        this.fbox((xf + xe) / 2, 0.09, hz, Math.max(0.6, Math.abs(xe - xf)), 0.06, 1.4, path);
                                    }
                                    if (rng() < 0.55) {
                                        const dx = bx !== 0 ? hx - bx * (ew * s / 2 + 1.6) : hx + (rng() < 0.5 ? 1 : -1) * (ew * s / 2 + 1.6);
                                        const dz = bz !== 0 ? hz - bz * (ed * s / 2 + 1.6) : hz + (rng() < 0.5 ? 1 : -1) * (ed * s / 2 + 1.6);
                                        if (dx > lx0 + 1 && dx < lx1 - 1 && dz > lz0 + 1 && dz < lz1 - 1) {
                                            this.fbox(dx, 0.08, dz, 5, 0.05, 5, col3(0x8b8b85));
                                        }
                                    }
                                    if (rng() < 0.5) {
                                        const tx = cx + (rng() - 0.5) * (lx1 - lx0) * 0.7;
                                        const tz = cz + (rng() - 0.5) * (lz1 - lz0) * 0.7;
                                        if (Math.abs(tx - hx) > ew * s / 2 + 1.5 || Math.abs(tz - hz) > ed * s / 2 + 1.5) {
                                            this.propSpots.trees.push({ x: tx, z: tz, s: 0.8 + rng() * 0.45, v: rng() < 0.5 ? 0 : 1 });
                                        }
                                    }
                                    continue;
                                }
                            }
                        }
                        if (hasUrban) {
                            if (this._placeBuilding('building_tenement', lx0, lz0, lx1, lz1, face, 14 + rng() * 6)) continue;
                        }
                        const floors = 2 + Math.floor(rng() * 2);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'brickRed',
                            tintJitter(col3(0xa86a4d), rng, 0.14), { stoop: face, cornice: true });
                    }
                    this._edgeTrees(block, rng, 0.65);
                    break;
                }
                case 'warehouse': {
                    const lots = lotsOf(26, 44);
                    for (const [lx0, lz0, lx1, lz1] of lots) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (rng() < 0.22 && (lx1 - lx0) >= 24 && (lz1 - lz0) >= 24) {
                            this._buildParkingLot({
                                id: 'lot_' + Math.round(lx0) + '_' + Math.round(lz0),
                                x1: lx0, z1: lz0, x2: lx1, z2: lz1,
                                name: 'Customer Parking',
                            });
                            continue;
                        }
                        if (hasUrban) {
                            const bkey = this._pick(['building_warehouse', 'building_castiron', 'factory_plant', 'warehouse_modern', 'data_center', 'carpark_garage', 'carpark_multistory', 'transit_station'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 18 + rng() * 10)) continue;
                        }
                        const floors = 3 + Math.floor(rng() * 3);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.6, 'castIron',
                            tintJitter(col3(0x8a7a63), rng, 0.1), { waterTower: rng() < 0.5 });
                        if (rng() < 0.5) {
                            this.fbox((lx0 + lx1) / 2, 0.7, lz0 - 1, Math.min(lx1 - lx0 - 2, 10), 1.2, 1.4, col3(0x5e5648));
                        }
                    }
                    break;
                }
                case 'castiron': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(18, 28)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['building_castiron', 'building_commercial', 'department_store', 'theater_cinema'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 20 + rng() * 8)) continue;
                        }
                        const floors = 5 + Math.floor(rng() * 2);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.6, 'castIron',
                            tintJitter(col3(0xa39070), rng, 0.1), { storefront: true, cornice: true });
                    }
                    break;
                }
                case 'midrise': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(24, 38)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['building_commercial', 'tower_prewar', 'tower_setback', 'hotel_tower', 'bank_capital', 'office_corporate_block', 'theater_cinema'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 32 + rng() * 24)) continue;
                        }
                        const floors = 8 + Math.floor(rng() * 8);
                        const style = rng() < 0.5 ? 'deco' : 'brickRed';
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, style,
                            tintJitter(col3(style === 'deco' ? 0xcabb9a : 0x9d5f48), rng, 0.08), {
                                storefront: rng() < 0.6, cornice: true, waterTower: rng() < 0.3,
                            });
                    }
                    this._edgeTrees(block, rng, 0.25);
                    break;
                }
                case 'deco': {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(22, 34)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['tower_artdeco', 'tower_setback', 'hotel_tower', 'bank_capital'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 50 + rng() * 35)) continue;
                        }
                        const floors = 10 + Math.floor(rng() * 10);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'deco',
                            tintJitter(col3(0xcabb9a), rng, 0.08), { storefront: true, cornice: true });
                    }
                    break;
                }
                case 'setback': {
                    const towerW = Math.min(w, 44), towerD = Math.min(d, 44);
                    const tx0 = x0 + rng() * Math.max(0, w - towerW), tz0 = z0 + rng() * Math.max(0, d - towerD);
                    if (!this._lotBlockedByLandmark(tx0, tz0, tx0 + towerW, tz0 + towerD)) {
                        if (hasUrban) {
                            const bkey = this._pick(['tower_setback', 'tower_artdeco', 'office_glass_spire', 'hotel_tower'], rng);
                            if (!this._placeBuilding(bkey, tx0, tz0, tx0 + towerW, tz0 + towerD, face, 60 + rng() * 30)) {
                                this._setbackTower(tx0, tz0, tx0 + towerW, tz0 + towerD, rng, col3(0xc4ccd4));
                            }
                        } else {
                            this._setbackTower(tx0, tz0, tx0 + towerW, tz0 + towerD, rng, col3(0xc4ccd4));
                        }
                    }
                    // Side-fill low annexes on the remaining strip.
                    if (w - towerW > 14) {
                        const ax = tx0 + towerW + 2;
                        if (ax < x1 - 10) {
                            if (!hasUrban || !this._placeBuilding('building_commercial', ax, z0, x1, z1, face, 16 + rng() * 10)) {
                                this._building(ax, z0, x1, z1, 12 + rng() * 12, 'glassBlue',
                                    tintJitter(col3(0x9FC3D4), rng, 0.08), { storefront: true });
                            }
                        }
                    }
                    break;
                }
                case 'glass': {
                    const towerW = Math.min(w, 34), towerD = Math.min(d, 34);
                    const tx0 = x0 + rng() * Math.max(0, w - towerW), tz0 = z0 + rng() * Math.max(0, d - towerD);
                    if (!this._lotBlockedByLandmark(tx0, tz0, tx0 + towerW, tz0 + towerD)) {
                        if (hasUrban) {
                            const bkey = this._pick(['tower_glass', 'tower_artdeco', 'office_glass_spire', 'office_corporate_block', 'hotel_tower', 'bank_capital'], rng);
                            if (!this._placeBuilding(bkey, tx0, tz0, tx0 + towerW, tz0 + towerD, face, 80 + rng() * 40)) {
                                const style = rng() < 0.5 ? 'glassTeal' : 'glassBlue';
                                const floors = 24 + Math.floor(rng() * 20);
                                this._building(tx0, tz0, tx0 + towerW, tz0 + towerD, floors * 3.2, style,
                                    tintJitter(col3(0xb8ccd4), rng, 0.06), { storefront: true });
                                this.fbox(tx0 + towerW / 2, floors * 3.2 + 1.2, tz0 + towerD / 2,
                                    towerW * 0.4, 2.2, towerD * 0.4, col3(0x6a7078));
                            }
                        } else {
                            const style = rng() < 0.5 ? 'glassTeal' : 'glassBlue';
                            const floors = 24 + Math.floor(rng() * 20);
                            this._building(tx0, tz0, tx0 + towerW, tz0 + towerD, floors * 3.2, style,
                                tintJitter(col3(0xb8ccd4), rng, 0.06), { storefront: true });
                            this.fbox(tx0 + towerW / 2, floors * 3.2 + 1.2, tz0 + towerD / 2,
                                towerW * 0.4, 2.2, towerD * 0.4, col3(0x6a7078));
                        }
                    }
                    break;
                }
                default: {
                    for (const [lx0, lz0, lx1, lz1] of lotsOf(16, 26)) {
                        if (this._lotBlockedByLandmark(lx0, lz0, lx1, lz1)) continue;
                        if (hasUrban) {
                            const bkey = this._pick(['building_commercial', 'building_tenement', 'tower_prewar', 'department_store', 'school_public', 'library_civic', 'transit_station', 'police_precinct'], rng);
                            if (bkey && this._placeBuilding(bkey, lx0, lz0, lx1, lz1, face, 18 + rng() * 14)) continue;
                        }
                        const floors = 4 + Math.floor(rng() * 6);
                        this._building(lx0, lz0, lx1, lz1, floors * 3.2, 'brickRed',
                            tintJitter(col3(0x9a5a42), rng, 0.12), { storefront: rng() < 0.4 });
                    }
                }
            }
        }

        /** Street trees around a block perimeter (chance per spot). */
        _edgeTrees(block, rng, density) {
            const step = 16;
            for (let x = block.x1 + 10; x < block.x2 - 8; x += step) {
                if (rng() < density) this.propSpots.trees.push({ x: x + rng() * 4, z: block.z1 + 4.2, s: 0.85 + rng() * 0.4, v: rng() < 0.5 ? 0 : 1 });
                if (rng() < density) this.propSpots.trees.push({ x: x + rng() * 4, z: block.z2 - 4.2, s: 0.85 + rng() * 0.4, v: rng() < 0.5 ? 0 : 1 });
            }
            for (let z = block.z1 + 10; z < block.z2 - 8; z += step) {
                if (rng() < density) this.propSpots.trees.push({ x: block.x1 + 4.2, z: z + rng() * 4, s: 0.85 + rng() * 0.4, v: rng() < 0.5 ? 0 : 1 });
                if (rng() < density) this.propSpots.trees.push({ x: block.x2 - 4.2, z: z + rng() * 4, s: 0.85 + rng() * 0.4, v: rng() < 0.5 ? 0 : 1 });
            }
        }

        // ---- landmarks ------------------------------------------------------------
        _buildLandmarks() {
            const byKind = {
                empire: (b) => this._lmEmpire(),
                chrysler: (b) => this._lmChrysler(),
                flatiron: (b) => this._lmFlatiron(),
                timessq: (b) => this._lmTimesSquare(),
                wtc: (b) => this._lmWtc(),
                grandcentral: (b) => this._lmGrandCentral(),
                rockefeller: (b) => this._lmRockefeller(),
                msg: (b) => this._lmMsg(),
                un: (b) => this._lmUN(),
                met: (b) => this._lmMet(),
                guggenheim: (b) => this._lmGuggenheim(),
                cathedral: (b) => this._lmCathedral(b),
                hospital: (b) => this._lmHospital(b),
                hospital_campus: (b) => this._lmHospitalCampus(b),
                police: (b) => this._lmPolice(b),
                precinct: (b) => this._lmPrecinct(b),
                apollo: (b) => this._lmApollo(),
                spray: (b) => this._lmSpray(b),
                parking: (b) => this._lmParking(b),
                gunshop: (b) => this._lmGunShop(b),
                foodshop: (b) => this._lmFoodShop(b),
            };
            this._landmarkGeos = this._landmarkGeos || {};
            for (const rawLm of LANDMARKS) {
                const lm = Array.isArray(rawLm) ? { id: rawLm[0], x1: rawLm[1], z1: rawLm[2], x2: rawLm[3], z2: rawLm[4], kind: rawLm[5] } : rawLm;
                if (lm.kind === 'hospital' || lm.kind === 'police' || lm.kind === 'hospital_campus' || lm.kind === 'precinct') {
                    const fn = byKind[lm.kind];
                    if (fn) fn(lm);
                    continue;
                }
                const assetKey = lm.kind === 'timessq' ? 'timesquare' : lm.kind;
                const glb = this.assets && this.assets.landmarks && this.assets.landmarks[assetKey];
                if (glb) {
                    try {
                        let geo = this._landmarkGeos[assetKey];
                        if (!geo) {
                            geo = glbMergedGeometry(glb.scene);
                            geo.computeBoundingBox();
                            const bb = geo.boundingBox;
                            geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
                            geo.computeBoundingBox();
                            this._landmarkGeos[assetKey] = geo;
                        }
                        const bb = geo.boundingBox;
                        const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y, bd = bb.max.z - bb.min.z;
                        const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
                        const lotW = lm.x2 - lm.x1, lotD = lm.z2 - lm.z1;
                        const targetW = Math.max(6, lotW - 4);
                        const targetD = Math.max(6, lotD - 4);
                        const scaleH = Math.min(targetW / bw, targetD / bd, 1.0);
                        let scaleY = scaleH;
                        if (assetKey === 'empire' || assetKey === 'chrysler' || assetKey === 'wtc' || assetKey === 'rockefeller' || assetKey === 'timesquare') {
                            scaleY = Math.min(1.0, Math.max(scaleH, 0.7));
                        }
                        const m = new THREE.Mesh(geo, this.mat.flat);
                        m.position.set(cx, 0.05, cz);
                        m.scale.set(scaleH, scaleY, scaleH);
                        m.castShadow = true;
                        m.receiveShadow = true;
                        this.root.add(m);
                        this.propMeshes.push(m);
                        const finalW = bw * scaleH, finalH = bh * scaleY, finalD = bd * scaleH;
                        this._collide(cx, 0.05 + finalH / 2, cz, finalW, finalH, finalD);
                        if (lm.kind === 'timessq') this.timesSqCenter = { x: cx, z: cz };
                        if (lm.kind === 'hospital') this.hospitalSpawn = { x: cx, z: lm.z1 - 4 };
                        if (lm.kind === 'police') this.policeSpawn = { x: cx, z: lm.z1 - 4 };
                        if (lm.kind === 'spray') (this.sprayShops = this.sprayShops || []).push({ x: cx, z: cz, r: 14 });
                        continue;
                    } catch (e) {
                        console.warn('Failed to place landmark GLB ' + assetKey, e);
                    }
                }
                const fn = byKind[lm.kind];
                if (fn) fn(lm);
            }
            this._lmBull();
            this._lmStatue();
        }

        _lmEmpire() { // Empire State Building — limestone setbacks + mast, 175 m
            const stone = col3(0xcfc4a8), dark = col3(0x8f8672);
            const cx = 761, cz = 2168;
            this._building(741, 2143, 781, 2194, 15, 'deco', stone, { storefront: true, noCollide: true });
            this._building(744, 2146, 778, 2191, 80, 'deco', stone, { y0: 15, noCollide: true, bulkhead: false });
            this._building(748, 2150, 774, 2187, 140, 'deco', stone, { y0: 80, noCollide: true, bulkhead: false });
            // Crown: setbacks in rings, then the mast.
            for (let i = 0; i < 4; i++) {
                const r = 9 - i * 1.8, y = 140 + i * 5;
                this.fcyl(cx, y + 2.5, cz, r, r - 1.2, 5, 10, stone);
            }
            this.fcyl(cx, 166, cz, 1.2, 0.15, 14, 6, dark);
            this.neonQuad([cx - 2.5, 178, cz - 2.5], [cx - 2.5, 186, cz - 2.5], [cx + 2.5, 186, cz + 2.5], [cx + 2.5, 178, cz + 2.5], [0, 1, 0], [1.0, 0.85, 0.4]);
            this._collide(cx, 70, cz, 40, 140, 51);
        }

        _lmChrysler() { // Chrysler Building — brick base, steel crown, 130 m
            const white = col3(0xd8d4c8), steel = col3(0x9aa8b4);
            const cx = 928, cz = 1973;
            this._building(909, 1948, 947, 1999, 18, 'deco', white, { storefront: true, noCollide: true });
            this._building(915, 1953, 941, 1994, 93, 'deco', white, { y0: 18, noCollide: true, bulkhead: false });
            // Stacked crown arcs.
            let y = 93;
            for (let i = 0; i < 6; i++) {
                const r = 8.5 - i * 1.2;
                this.fcyl(cx, y + 2, cz, r, r, 4, 10, steel);
                this.fdisc(cx, y + 4, cz, r, 10, steel, true);
                y += 4;
            }
            this.fcyl(cx, y + 5, cz, 0.7, 0.08, 10, 6, steel);
            this._collide(cx, 46, cz, 38, 93, 51);
        }

        _lmFlatiron() { // Flatiron — limestone wedge in the 5th/Broadway split
            const lime = col3(0xd9c9a3);
            // Storefront podium first, then the wedge above it. The lot is the
            // slice between Broadway's east curb and 5th Ave's west curb, so
            // every coordinate here stays inside x 707..725, z 2403..2454.
            this._building(707, 2426, 725, 2452, 3.4, 'storefront', [1, 1, 1], { noCollide: true, bulkhead: false });
            const apex = [716, 2405], bl = [708, 2452], br = [724, 2452];
            const fb = this._facadeBatch('limestone', 716, 2428);
            fb.prismY(
                { x: apex[0], z: apex[1] }, { x: bl[0], z: bl[1] }, { x: br[0], z: br[1] },
                3.2, 85, lime, [TILE_W, TILE_H]
            );
            // Roof triangle.
            this.fquad([apex[0], 85, apex[1]], [bl[0], 85, bl[1]], [br[0], 85, br[1]], [br[0], 85, br[1]], [0, 1, 0], col3(0x6a655a));
            this._collide(716, 42.5, 2428, 16, 85, 47);
        }

        _lmTimesSquare() { // Times Square — plaza, red steps, billboard canyon
            const cx = 586, cz = 1973;
            // Plaza paving: the wedge east of Broadway, hugging its curb.
            this.fquad([554, 0.17, 1948], [565, 0.17, 1999], [606, 0.17, 1999], [606, 0.17, 1948], [0, 1, 0], col3(0x585a62));
            // Red steps (south end).
            for (let i = 0; i < 6; i++) {
                this.fbox(cx, 0.35 + i * 0.4, 1992 - i * 1.1, 24, 0.8, 1.1, col3(0xa33327));
            }
            // Framing buildings — both east of Broadway, off the roadway.
            this._building(566, 1948, 584, 1968, 46, 'deco', col3(0xcabb9a), { storefront: true });
            this._building(588, 1978, 604, 1998, 30, 'deco', col3(0xbfae8e), { storefront: true });
            // Billboard canyon — 8 panels aimed at the plaza from 3 sides. These
            // deliberately overhang the street, as the real ones do.
            const panels = [
                { x: 575, z: 1950, ry: 0, w: 16, h: 8, y: 22 }, { x: 575, z: 1966, ry: 0, w: 16, h: 8, y: 14 },
                { x: 575, z: 1984, ry: 0, w: 14, h: 9, y: 20 }, { x: 601, z: 1950, ry: Math.PI, w: 14, h: 7, y: 18 },
                { x: 601, z: 1972, ry: Math.PI, w: 16, h: 8, y: 26 }, { x: 560, z: 1958, ry: Math.PI / 2, w: 16, h: 8, y: 24 },
                { x: 560, z: 1980, ry: Math.PI / 2, w: 16, h: 7, y: 16 }, { x: 586, z: 1949, ry: Math.PI, w: 20, h: 9, y: 30 },
            ];
            panels.forEach((p, i) => {
                const c = Math.cos(p.ry), s = Math.sin(p.ry);
                // Panel corners: faces -z rotated by ry; outward normal (s*? ) — facing plaza.
                const nx = -s, nz = -c;
                const ux = c, uz = -s; // panel's right axis
                const hx = p.w / 2;
                const ax = p.x - ux * hx, az = p.z - uz * hx, bx = p.x + ux * hx, bz = p.z + uz * hx;
                this.billboardQuad(
                    [ax, p.y, az], [ax, p.y + p.h, az], [bx, p.y + p.h, bz], [bx, p.y, bz],
                    [nx, 0.25, nz], i % 8
                );
                // Mount frame.
                this.fbox(p.x, p.y + p.h / 2, p.z, Math.abs(ux) * p.w + 0.6, p.h + 0.6, Math.abs(uz) * p.w + 0.6, col3(0x2a2c30));
            });
            this.timesSqCenter = { x: cx, z: cz };
        }

        _lmWtc() { // One World Trade — tapered glass monolith, 150 m + spire
            const glass = col3(0xb8ccd8);
            const cx = 740, cz = 3206;
            this._building(705, 3181, 775, 3232, 60, 'glassTeal', glass, { storefront: true, noCollide: true });
            this._building(709, 3185, 771, 3228, 110, 'glassTeal', glass, { y0: 60, noCollide: true, bulkhead: false });
            this._building(713, 3189, 767, 3224, 150, 'glassTeal', glass, { y0: 110, noCollide: true, bulkhead: false });
            this.fcyl(cx, 158, cz, 1.4, 0.1, 30, 6, col3(0xd0d4da));
            this._collide(cx, 30, cz, 70, 60, 51);
        }

        _lmGrandCentral() { // Grand Central — limestone temple + colonnade
            const lime = col3(0xd9c9a3);
            const cx = 875, cz = 1973;
            this._building(854, 1948, 896, 1999, 16, 'limestone', lime, { noCollide: true });
            // Colonnade on the 42nd St (north) face.
            for (let i = 0; i < 7; i++) {
                const x = 858 + i * 5.8;
                this.fcyl(x, 8, 1951, 0.55, 0.55, 12, 8, col3(0xe4d8b8));
            }
            this.fbox(cx, 14.8, 1952.5, 44, 1.6, 3.5, col3(0xcabf9f));
            // Green copper roof drum.
            this.fcyl(cx, 18.5, 1980, 9, 9, 5, 12, col3(0x5e7a5a));
            this.fdisc(cx, 21, 1980, 9, 12, col3(0x5e7a5a), true);
            // Clock face glow on the facade.
            this.neonQuad([cx - 1.5, 17.5, 1947.7], [cx - 1.5, 20.5, 1947.7], [cx + 1.5, 20.5, 1947.7], [cx + 1.5, 17.5, 1947.7], [0, 0, -1], [1, 0.95, 0.7]);
            this._collide(cx, 8, cz, 42, 16, 51);
        }

        _lmRockefeller() { // Rockefeller Center — plaza + main tower + low wings
            const lime = col3(0xcfc4a8);
            const cx = 700, cz = 1648;
            // Sunken plaza + gold statue.
            this.fquad([655, 0.17, 1625], [655, 0.17, 1670], [695, 0.17, 1670], [695, 0.17, 1625], [0, 1, 0], col3(0x8a8478));
            this.fcyl(cx - 12, 1.2, cz, 1.6, 1.2, 3.4, 8, col3(0xc9a227));
            this.fdisc(cx - 12, 2.9, cz, 1.2, 8, col3(0xc9a227), true);
            // Main tower (east).
            this._building(694, 1624, 724, 1672, 85, 'deco', lime, { storefront: true, noCollide: true });
            // Low wings (west + south).
            this._building(652, 1624, 690, 1646, 22, 'limestone', col3(0xd9c9a3), { storefront: true, noCollide: true });
            this._building(652, 1650, 690, 1672, 26, 'limestone', col3(0xd9c9a3), { noCollide: true });
            // Flag poles around the plaza.
            for (const [px, pz] of [[657, 1628], [657, 1668], [691, 1628], [691, 1668]]) {
                this.fbox(px, 4, pz, 0.15, 8, 0.15, col3(0xb8bcc4));
            }
            this._collide(709, 42, 1648, 30, 85, 48);
            this._collide(671, 11, 1635, 38, 22, 22);
            this._collide(671, 13, 1661, 38, 26, 22);
        }

        _lmMsg() { // Madison Square Garden — arena cylinder above Penn
            const silver = col3(0xb4aa9a);
            const cx = 498, cz = 2101;
            this._building(461, 2076, 536, 2127, 10, 'storefront', [1, 1, 1], { noCollide: true, bulkhead: false });
            const fb = this._facadeBatch('deco', cx, cz);
            fb.cylinderY(cx, 10 + 8, cz, 31, 33, 16, 20, silver, { uvTile: [TILE_W, TILE_H], capped: 'top' });
            this.fdisc(cx, 18.2, cz, 33, 20, col3(0x8a8276), true);
            // Ribbon of poster panels around the crown.
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const px = cx + Math.sin(a) * 33.4, pz = cz + Math.cos(a) * 33.4;
                this.billboardQuad(
                    [px - Math.cos(a) * 4, 12, pz + Math.sin(a) * 4], [px - Math.cos(a) * 4, 16, pz + Math.sin(a) * 4],
                    [px + Math.cos(a) * 4, 16, pz - Math.sin(a) * 4], [px + Math.cos(a) * 4, 12, pz - Math.sin(a) * 4],
                    [Math.sin(a), 0, Math.cos(a)], i % 8
                );
            }
            this._collide(cx, 9, cz, 62, 18, 51);
        }

        _lmUN() { // UN Secretariat — glass slab + colonnade + plaza
            const glass = col3(0xc4d8e0);
            const cx = 1077, cz = 1906;
            this._building(1068, 1896, 1086, 1918, 60, 'glassTeal', glass, { noCollide: true });
            for (let i = 0; i < 6; i++) {
                this.fcyl(1066, 5, 1899 + i * 4, 0.5, 0.5, 10, 8, col3(0xe8e4d8));
            }
            this.fquad([1060, 0.17, 1884], [1060, 0.17, 1930], [1094, 0.17, 1930], [1094, 0.17, 1884], [0, 1, 0], col3(0x9aa4a8));
            // Flag row.
            for (let i = 0; i < 5; i++) this.fbox(1062 + i * 7, 4, 1886, 0.12, 8, 0.12, col3(0xb8bcc4));
            this._collide(cx, 30, cz, 18, 60, 22);
        }

        _lmMet() { // The Met — limestone palace with front steps
            const lime = col3(0xd9c9a3);
            const cx = 761, cz = 1063;
            this._building(741, 1038, 781, 1088, 16, 'limestone', lime, { noCollide: true });
            // Grand steps on the 5th Ave (west) face.
            for (let i = 0; i < 4; i++) {
                this.fbox(738 - i * 1.4, 0.3 + (3 - i) * 0.5, cz, 1.4, (3 - i) * 1.0 + 0.6, 34, col3(0xcabf9f));
            }
            // Colonnade + pediment.
            for (let i = 0; i < 6; i++) this.fcyl(742.5, 6, 1046 + i * 7, 0.55, 0.55, 10, 8, col3(0xe4d8b8));
            const fb = this._facadeBatch('limestone', cx, cz);
            fb.prismY({ x: 761, z: 1037 }, { x: 741, z: 1037.01 }, { x: 781, z: 1037.01 }, 16, 19.5, col3(0xcabf9f));
            this._collide(cx, 8, cz, 40, 16, 50);
        }

        _lmGuggenheim() { // Guggenheim — stacked white rotundas
            const white = col3(0xe8e4dc);
            const cx = 761, cz = 996;
            this.fcyl(cx, 5, cz, 14, 14, 10, 18, white, { capped: 'top' });
            this.fcyl(cx + 3, 10 + 2.5, cz - 2, 10, 10, 5, 14, white, { capped: 'top' });
            this.fcyl(cx - 4, 12, cz + 4, 6, 6, 4, 12, white, { capped: 'top' });
            this._building(741, 1005, 761, 1022, 6, 'limestone', white, { noCollide: true });
            this._collide(cx, 5, cz, 28, 10, 28);
        }

        _lmCathedral(lm) { // St Patrick's — gothic nave + twin spires
            const stone = col3(0xd8d0c0);
            const cx = (lm.x1 + lm.x2) / 2;
            this._building(lm.x1, lm.z1, lm.x2, lm.z2, 22, 'limestone', stone, { parapet: true, noCollide: true });
            // Twin towers on the south (front) face.
            for (const tx of [lm.x1 + 5, lm.x2 - 5]) {
                this.fbox(tx, 19, lm.z2 - 4, 8, 38, 8, stone);
                this.fcyl(tx, 38 + 5, lm.z2 - 4, 3.4, 0.3, 10, 6, col3(0x8a8478));
            }
            // Rose window.
            this.fdisc(cx, 16, lm.z2 + 0.1, 2.2, 12, col3(0x3a5f8a), true);
            this.neonQuad([cx - 1.8, 14, lm.z2 + 0.12], [cx - 1.8, 18, lm.z2 + 0.12], [cx + 1.8, 18, lm.z2 + 0.12], [cx + 1.8, 14, lm.z2 + 0.12], [0, 0, 1], [0.4, 0.6, 1.0]);
            this._collide(cx, 11, (lm.z1 + lm.z2) / 2, lm.x2 - lm.x1, 22, lm.z2 - lm.z1);
        }

        _lmHospital(lm) {
            // Bellevue Medical Center: 3-Story Explorable Trauma Hospital + Rooftop Helipad
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            const w = lm.x2 - lm.x1, d = lm.z2 - lm.z1;

            // Ground paved perimeter lot
            this.fquad([lm.x1, 0.17, lm.z1], [lm.x1, 0.17, lm.z2], [lm.x2, 0.17, lm.z2], [lm.x2, 0.17, lm.z1], [0, 1, 0], col3(0x32363e));

            // Emergency Ambulance Bay on front driveway (lm.z1 to lm.z1 + 8)
            this.fbox(cx, 4.4, lm.z1 + 4.0, 18.0, 0.4, 7.5, col3(0xd82626));
            this.fcyl(cx - 8.5, 2.2, lm.z1 + 1.2, 0.28, 0.28, 4.4, 8, col3(0xd8d8d8));
            this.fcyl(cx + 8.5, 2.2, lm.z1 + 1.2, 0.28, 0.28, 4.4, 8, col3(0xd8d8d8));

            // Parked Emergency Ambulance
            const ambX = cx + 5.5, ambZ = lm.z1 + 4.5;
            this.fbox(ambX, 1.3, ambZ, 2.4, 2.2, 5.2, col3(0xf0f0f4));
            this.fbox(ambX, 1.3, ambZ, 2.45, 0.4, 5.2, col3(0xd82626));
            this.fbox(ambX, 2.5, ambZ - 1.2, 1.4, 0.2, 0.6, col3(0xff2222));
            this.neonQuad([ambX - 0.7, 2.5, ambZ - 1.2], [ambX - 0.7, 2.65, ambZ - 1.2], [ambX + 0.7, 2.65, ambZ - 1.2], [ambX + 0.7, 2.5, ambZ - 1.2], [0, 0, -1], [1, 0.2, 0.2]);
            this._collide(ambX, 1.3, ambZ, 2.5, 2.2, 5.4);

            // Exterior Building Structure: 3 Explorable Floors (Height 17.2m total)
            const bldgZ1 = lm.z1 + 8.0, bldgZ2 = lm.z2 - 1.0;
            const bldgD = bldgZ2 - bldgZ1;
            const bldgCZ = (bldgZ1 + bldgZ2) / 2;
            const bldgW = w - 2.0;
            const wallCol = col3(0x9d5f48);
            const wallTrim = col3(0x8f5542);
            const floorCol = col3(0xd8e2e6);
            const darkFloor = col3(0x282b30);
            const stairCol = col3(0xc5d0d6);
            const railCol = col3(0x758088);

            // Ground Floor (y = 0.18m) glossy medical linoleum
            this.fquad([lm.x1 + 1.0, 0.18, bldgZ1], [lm.x1 + 1.0, 0.18, bldgZ2], [lm.x2 - 1.0, 0.18, bldgZ2], [lm.x2 - 1.0, 0.18, bldgZ1], [0, 1, 0], floorCol);

            // Exterior North Wall (Front facade with open 6.4m entrance)
            const wL = (cx - 3.2) - (lm.x1 + 1.0);
            this.fbox(lm.x1 + 1.0 + wL / 2, 8.6, bldgZ1, wL, 17.2, 1.6, wallCol);
            this._collide(lm.x1 + 1.0 + wL / 2, 8.6, bldgZ1, wL, 17.2, 1.6);
            const wR = (lm.x2 - 1.0) - (cx + 3.2);
            this.fbox(cx + 3.2 + wR / 2, 8.6, bldgZ1, wR, 17.2, 1.6, wallCol);
            this._collide(cx + 3.2 + wR / 2, 8.6, bldgZ1, wR, 17.2, 1.6);
            // Entrance header above walk-in door
            this.fbox(cx, 11.0, bldgZ1, 6.4, 12.4, 1.6, wallTrim);

            // Exterior South Wall (Rear wall, solid)
            this.fbox(cx, 8.6, bldgZ2, bldgW, 17.2, 1.6, wallCol);
            this._collide(cx, 8.6, bldgZ2, bldgW, 17.2, 1.6);

            // Exterior West & East perimeter walls
            this.fbox(lm.x1 + 1.0, 8.6, bldgCZ, 1.6, 17.2, bldgD, wallCol);
            this._collide(lm.x1 + 1.0, 8.6, bldgCZ, 1.6, 17.2, bldgD);
            this.fbox(lm.x2 - 1.0, 8.6, bldgCZ, 1.6, 17.2, bldgD, wallCol);
            this._collide(lm.x2 - 1.0, 8.6, bldgCZ, 1.6, 17.2, bldgD);

            // Illuminated Red Cross & ER Marquee Signs
            const signZ = bldgZ1 - 0.85;
            this.neonQuad([cx - 0.5, 4.6, signZ], [cx - 0.5, 6.6, signZ], [cx + 0.5, 6.6, signZ], [cx + 0.5, 4.6, signZ], [0, 0, -1], [1, 0.1, 0.1]);
            this.neonQuad([cx - 1.5, 5.3, signZ], [cx - 1.5, 5.9, signZ], [cx + 1.5, 5.9, signZ], [cx + 1.5, 5.3, signZ], [0, 0, -1], [1, 0.1, 0.1]);
            this.neonQuad([cx - 9, 6.2, signZ], [cx - 9, 6.8, signZ], [cx + 9, 6.8, signZ], [cx + 9, 6.2, signZ], [0, 0, -1], [1, 0.95, 0.95]);

            // Helper: Staircase Builder (Walkable with colliders per step)
            const addStairs = (x0, z0, yStart, yEnd, zLen, wStair, risePerStep) => {
                const steps = Math.ceil((yEnd - yStart) / risePerStep);
                const actualRise = (yEnd - yStart) / steps;
                const dZ = zLen / steps;
                for (let i = 0; i < steps; i++) {
                    const stepY = yStart + (i + 1) * actualRise;
                    const stepZ = z0 + (i + 0.5) * dZ;
                    this.fbox(x0, stepY - actualRise / 2, stepZ, wStair, actualRise, Math.abs(dZ) + 0.05, stairCol);
                    this._collide(x0, stepY - actualRise / 2, stepZ, wStair, actualRise, Math.abs(dZ) + 0.05);
                }
                // Handrails on side
                this.fcyl(x0 + wStair / 2, yStart + (yEnd - yStart) / 2 + 0.5, z0 + zLen / 2, 0.03, 0.03, Math.hypot(zLen, yEnd - yStart), 6, railCol);
            };

            // =========================================================================
            // FLOOR 1 (Ground Level): ER Lobby, Triage, Trauma Bays & Pharmacy
            // =========================================================================
            // Ceiling lights
            for (let lz = bldgZ1 + 4; lz <= bldgZ2 - 4; lz += 6.5) {
                this.neonQuad([cx - 5, 5.4, lz], [cx - 5, 5.4, lz + 1.2], [cx + 5, 5.4, lz + 1.2], [cx + 5, 5.4, lz], [0, -1, 0], [0.95, 0.98, 1.0]);
            }

            // Triage Reception Counter (cx - 3.5, lm.z1 + 14)
            const triageZ = lm.z1 + 14.0;
            this.fbox(cx - 3.5, 0.55, triageZ, 6.0, 1.1, 1.4, col3(0x2a506a));
            this._collide(cx - 3.5, 0.55, triageZ, 6.0, 1.1, 1.4);
            this.fbox(cx - 3.5, 1.12, triageZ, 6.4, 0.1, 1.6, col3(0xdfe6e9));
            this.fbox(cx - 4.2, 1.4, triageZ, 0.6, 0.4, 0.1, col3(0x1a1a1a));
            this.neonQuad([cx - 4.45, 1.25, triageZ - 0.1], [cx - 4.45, 1.55, triageZ - 0.1], [cx - 3.95, 1.55, triageZ - 0.1], [cx - 3.95, 1.25, triageZ - 0.1], [0, 0, -1], [0.3, 0.8, 1.0]);

            // Waiting Lounge on East side
            for (let ci = 0; ci < 5; ci++) {
                this.fbox(cx + 8, 0.45, lm.z1 + 11 + ci * 1.6, 1.4, 0.85, 1.0, col3(0x1976d2));
            }
            this.fcyl(cx + 12, 0.7, lm.z1 + 11, 0.25, 0.25, 1.4, 8, col3(0xffffff));
            this.fcyl(cx + 12, 1.6, lm.z1 + 11, 0.22, 0.22, 0.4, 8, [0.4, 0.7, 1.0]);

            // ER Trauma Treatment Bay (South side)
            this.fbox(cx - 7, 1.8, lm.z1 + 20, 10.0, 3.6, 0.3, col3(0x8fa3a8));
            this.fbox(cx + 7, 1.8, lm.z1 + 20, 10.0, 3.6, 0.3, col3(0x8fa3a8));

            // Hospital Bed 1 (West trauma bay)
            const bed1Z = lm.z1 + 24.5;
            this.fbox(cx - 7, 0.45, bed1Z, 1.8, 0.8, 3.2, col3(0x4a6984));
            this.fbox(cx - 7, 0.9, bed1Z, 1.6, 0.25, 3.0, col3(0xffffff));
            this.fbox(cx - 7, 1.05, bed1Z + 1.1, 1.2, 0.15, 0.6, col3(0x90caf9));
            this._collide(cx - 7, 0.5, bed1Z, 1.8, 1.0, 3.2);

            // Hospital Bed 2 (Center-East trauma bay)
            this.fbox(cx + 5, 0.45, bed1Z, 1.8, 0.8, 3.2, col3(0x4a6984));
            this.fbox(cx + 5, 0.9, bed1Z, 1.6, 0.25, 3.0, col3(0xffffff));
            this.fbox(cx + 5, 1.05, bed1Z + 1.1, 1.2, 0.15, 0.6, col3(0x90caf9));
            this._collide(cx + 5, 0.5, bed1Z, 1.8, 1.0, 3.2);

            // Hospital Bed 3 (East trauma bay)
            this.fbox(cx + 11, 0.45, bed1Z, 1.8, 0.8, 3.2, col3(0x4a6984));
            this.fbox(cx + 11, 0.9, bed1Z, 1.6, 0.25, 3.0, col3(0xffffff));
            this.fbox(cx + 11, 1.05, bed1Z + 1.1, 1.2, 0.15, 0.6, col3(0x90caf9));
            this._collide(cx + 11, 0.5, bed1Z, 1.8, 1.0, 3.2);

            // ECG Heart Rate Monitors with glowing green waveforms
            this.neonQuad([cx - 7.6, 1.5, lm.z1 + 22.8], [cx - 7.6, 1.9, lm.z1 + 22.8], [cx - 6.4, 1.9, lm.z1 + 22.8], [cx - 6.4, 1.5, lm.z1 + 22.8], [0, 0, 1], [0.1, 1.0, 0.3]);
            this.neonQuad([cx + 4.4, 1.5, lm.z1 + 22.8], [cx + 4.4, 1.9, lm.z1 + 22.8], [cx + 5.6, 1.9, lm.z1 + 22.8], [cx + 5.6, 1.5, lm.z1 + 22.8], [0, 0, 1], [0.1, 1.0, 0.3]);

            // Pharmacy & Dispensary Counter (Far South-East)
            this.fbox(cx + 8, 0.55, bldgZ2 - 6, 8.0, 1.1, 1.4, col3(0x2d485e));
            this._collide(cx + 8, 0.55, bldgZ2 - 6, 8.0, 1.1, 1.4);
            // Medicine Shelves
            this.fbox(cx + 8, 2.2, bldgZ2 - 1.2, 8.0, 3.2, 0.6, col3(0x3a4852));
            this.fbox(cx + 8, 2.0, bldgZ2 - 0.8, 7.6, 0.1, 0.4, col3(0xffffff));

            // Staircase 1: Ground -> Floor 2 (West side: x = lm.x1 + 4.5, z = bldgZ2 - 16 to bldgZ2 - 4)
            const stairX = lm.x1 + 4.5;
            addStairs(stairX, bldgZ2 - 16, 0.18, 5.60, 12.0, 3.2, 0.28);

            // =========================================================================
            // FLOOR 2 (Elevated Floor, y = 5.60m): ICU, Radiology Scanner & Doctor Offices
            // =========================================================================
            // Floor 2 Slab (with stairwell cutout at West: x < lm.x1 + 7, z between bldgZ2 - 17 and bldgZ2 - 3)
            const f2MainW = bldgW - 7.5;
            const f2MainCX = (lm.x1 + 7.5 + lm.x2 - 1.0) / 2;
            this.fbox(f2MainCX, 5.42, bldgCZ, f2MainW, 0.36, bldgD, floorCol);
            this._collide(f2MainCX, 5.42, bldgCZ, f2MainW, 0.36, bldgD);
            // West landing slab outside stair cutout
            const f2WestD = (bldgZ2 - 17) - bldgZ1;
            if (f2WestD > 0) {
                const f2WestCZ = (bldgZ1 + bldgZ2 - 17) / 2;
                this.fbox(lm.x1 + 4.25, 5.42, f2WestCZ, 6.5, 0.36, f2WestD, floorCol);
                this._collide(lm.x1 + 4.25, 5.42, f2WestCZ, 6.5, 0.36, f2WestD);
            }

            // Ceiling lights Floor 2
            for (let lz = bldgZ1 + 5; lz <= bldgZ2 - 5; lz += 7.0) {
                this.neonQuad([cx - 4, 11.0, lz], [cx - 4, 11.0, lz + 1.2], [cx + 4, 11.0, lz + 1.2], [cx + 4, 11.0, lz], [0, -1, 0], [0.95, 0.98, 1.0]);
            }

            // ICU Ward (North-East on Floor 2): 3 Critical Care Beds with Telemetry
            for (let bi = 0; bi < 3; bi++) {
                const bz = bldgZ1 + 5 + bi * 4.2;
                this.fbox(cx + 8, 5.60 + 0.45, bz, 1.8, 0.8, 3.2, col3(0x3a5874));
                this.fbox(cx + 8, 5.60 + 0.9, bz, 1.6, 0.25, 3.0, col3(0xffffff));
                this._collide(cx + 8, 5.60 + 0.5, bz, 1.8, 1.0, 3.2);
                this.neonQuad([cx + 6.8, 5.60 + 1.5, bz], [cx + 6.8, 5.60 + 1.9, bz], [cx + 7.8, 5.60 + 1.9, bz], [cx + 7.8, 5.60 + 1.5, bz], [0, 0, 1], [0.1, 0.8, 1.0]);
            }

            // Radiology & Imaging Suite (Center-West on Floor 2): Full-Scale MRI / CT Scanner Ring!
            const mriX = cx - 2.0, mriZ = bldgZ1 + 10.0;
            // MRI Gantry Ring (Outer housing)
            this.fbox(mriX, 5.60 + 1.8, mriZ, 3.6, 3.6, 2.4, col3(0xeef2f5));
            this._collide(mriX, 5.60 + 1.8, mriZ, 3.6, 3.6, 2.4);
            // Central bore hole (contrast dark ring)
            this.fbox(mriX, 5.60 + 1.8, mriZ - 1.22, 1.8, 1.8, 0.1, col3(0x1a2530));
            // Patient Sliding Table
            this.fbox(mriX, 5.60 + 0.85, mriZ - 2.2, 1.2, 0.8, 2.8, col3(0x4a6984));
            this.fbox(mriX, 5.60 + 1.3, mriZ - 2.2, 1.0, 0.15, 2.6, col3(0xffffff));
            // Diagnostic Viewing Console & X-ray Lightboxes
            this.fbox(mriX - 3.5, 5.60 + 0.6, mriZ - 1.5, 1.4, 1.1, 2.2, col3(0x2a3d4e));
            this.neonQuad([mriX - 3.5, 5.60 + 1.5, mriZ - 2.5], [mriX - 3.5, 5.60 + 2.4, mriZ - 2.5], [mriX - 2.2, 5.60 + 2.4, mriZ - 2.5], [mriX - 2.2, 5.60 + 1.5, mriZ - 2.5], [0, 0, 1], [0.4, 0.85, 1.0]);

            // Doctors' Consultation Desks (South on Floor 2)
            for (let di = 0; di < 2; di++) {
                const dx = cx - 1.0 + di * 7.5;
                const dz = bldgZ2 - 7.0;
                this.fbox(dx, 5.60 + 0.55, dz, 2.8, 1.1, 1.6, col3(0x3e2723));
                this._collide(dx, 5.60 + 0.55, dz, 2.8, 1.1, 1.6);
                // Swivel chair & PC monitor
                this.fbox(dx, 5.60 + 0.45, dz - 1.2, 0.8, 0.85, 0.8, col3(0x1a1a1a));
                this.neonQuad([dx - 0.4, 5.60 + 1.2, dz], [dx - 0.4, 5.60 + 1.6, dz], [dx + 0.4, 5.60 + 1.6, dz], [dx + 0.4, 5.60 + 1.2, dz], [0, 0, -1], [0.2, 0.7, 1.0]);
            }

            // Staircase 2: Floor 2 -> Floor 3 (Same stairwell, ascending to 11.20m)
            addStairs(stairX, bldgZ2 - 16, 5.60, 11.20, 12.0, 3.2, 0.28);

            // =========================================================================
            // FLOOR 3 (Upper Floor, y = 11.20m): Operating Theaters & Chief Office
            // =========================================================================
            // Floor 3 Slab
            this.fbox(f2MainCX, 11.02, bldgCZ, f2MainW, 0.36, bldgD, floorCol);
            this._collide(f2MainCX, 11.02, bldgCZ, f2MainW, 0.36, bldgD);
            if (f2WestD > 0) {
                const f2WestCZ = (bldgZ1 + bldgZ2 - 17) / 2;
                this.fbox(lm.x1 + 4.25, 11.02, f2WestCZ, 6.5, 0.36, f2WestD, floorCol);
                this._collide(lm.x1 + 4.25, 11.02, f2WestCZ, 6.5, 0.36, f2WestD);
            }

            // Ceiling lights Floor 3
            for (let lz = bldgZ1 + 5; lz <= bldgZ2 - 5; lz += 7.0) {
                this.neonQuad([cx - 4, 16.6, lz], [cx - 4, 16.6, lz + 1.2], [cx + 4, 16.6, lz + 1.2], [cx + 4, 16.6, lz], [0, -1, 0], [0.95, 0.98, 1.0]);
            }

            // Surgical Operating Theater 1 (North on Floor 3)
            const orZ = bldgZ1 + 10.0;
            // Stainless steel operating table
            this.fbox(cx + 4, 11.20 + 0.65, orZ, 1.6, 0.9, 3.4, col3(0x78909c));
            this.fbox(cx + 4, 11.20 + 1.15, orZ, 1.4, 0.15, 3.2, col3(0xdfe6e9));
            this._collide(cx + 4, 11.20 + 0.65, orZ, 1.6, 1.1, 3.4);
            // Articulated overhead round surgical lamp
            this.fcyl(cx + 4, 11.20 + 4.2, orZ, 0.9, 0.9, 0.25, 10, col3(0xffffff));
            this.neonQuad([cx + 3.2, 11.20 + 4.05, orZ - 0.8], [cx + 3.2, 11.20 + 4.05, orZ + 0.8], [cx + 4.8, 11.20 + 4.05, orZ + 0.8], [cx + 4.8, 11.20 + 4.05, orZ - 0.8], [0, -1, 0], [1.0, 1.0, 1.0]);
            // Anesthesia workstation & surgical trays
            this.fbox(cx - 0.5, 11.20 + 0.9, orZ, 1.2, 1.4, 1.2, col3(0x37474f));
            this.neonQuad([cx - 0.5, 11.20 + 1.5, orZ - 0.55], [cx - 0.5, 11.20 + 1.8, orZ - 0.55], [cx + 0.1, 11.20 + 1.8, orZ - 0.55], [cx + 0.1, 11.20 + 1.5, orZ - 0.55], [0, 0, -1], [0.1, 1.0, 0.5]);

            // Chief Medical Officer Executive Office (South on Floor 3)
            const chiefZ = bldgZ2 - 7.0;
            this.fbox(cx + 4, 11.20 + 0.55, chiefZ, 3.4, 1.1, 1.8, col3(0x4e342e));
            this._collide(cx + 4, 11.20 + 0.55, chiefZ, 3.4, 1.1, 1.8);
            this.fbox(cx + 4, 11.20 + 0.55, chiefZ - 1.4, 0.9, 0.95, 0.9, col3(0x1a1a1a));

            // Staircase 3: Floor 3 -> Rooftop Helipad
            addStairs(stairX, bldgZ2 - 16, 11.20, 16.80, 12.0, 3.2, 0.28);

            // =========================================================================
            // ROOF LEVEL (y = 16.80m): Helipad with Landing H & Perimeter Beacons
            // =========================================================================
            // Main Roof Slab
            this.fbox(cx, 16.62, bldgCZ, bldgW + 1.0, 0.40, bldgD + 1.0, darkFloor);
            this._collide(cx, 16.62, bldgCZ, bldgW + 1.0, 0.40, bldgD + 1.0);

            // Stairwell Penthouse Enclosure on Roof (Over stairX)
            this.fbox(stairX, 18.3, bldgZ2 - 9, 4.4, 3.0, 10.0, wallCol);
            this._collide(stairX, 18.3, bldgZ2 - 9, 4.4, 3.0, 10.0);
            // Penthouse door out to helipad
            this.fbox(stairX + 2.1, 17.6, bldgZ2 - 9, 0.2, 2.0, 1.4, col3(0x1a2530));

            // Elevated Helipad Deck (18m x 18m)
            const heliCZ = bldgZ1 + 14.0;
            this.fbox(cx + 2.0, 16.85, heliCZ, 18.0, 0.15, 18.0, col3(0x263238));
            // Helipad 'H' Landing Marking (bright yellow neon)
            this.neonQuad([cx + 0.5, 16.95, heliCZ - 2.8], [cx + 0.5, 16.95, heliCZ + 2.8], [cx + 1.1, 16.95, heliCZ + 2.8], [cx + 1.1, 16.95, heliCZ - 2.8], [0, 1, 0], [1.0, 0.85, 0.1]);
            this.neonQuad([cx + 2.9, 16.95, heliCZ - 2.8], [cx + 2.9, 16.95, heliCZ + 2.8], [cx + 3.5, 16.95, heliCZ + 2.8], [cx + 3.5, 16.95, heliCZ - 2.8], [0, 1, 0], [1.0, 0.85, 0.1]);
            this.neonQuad([cx + 1.1, 16.95, heliCZ - 0.4], [cx + 1.1, 16.95, heliCZ + 0.4], [cx + 2.9, 16.95, heliCZ + 0.4], [cx + 2.9, 16.95, heliCZ - 0.4], [0, 1, 0], [1.0, 0.85, 0.1]);

            // Corner Aviation Warning Beacons (Red flashing)
            for (const hx of [cx + 2.0 - 8.5, cx + 2.0 + 8.5]) {
                for (const hz of [heliCZ - 8.5, heliCZ + 8.5]) {
                    this.fcyl(hx, 17.2, hz, 0.08, 0.08, 0.7, 6, col3(0xffffff));
                    this.neonQuad([hx - 0.15, 17.55, hz - 0.15], [hx - 0.15, 17.55, hz + 0.15], [hx + 0.15, 17.55, hz + 0.15], [hx + 0.15, 17.55, hz - 0.15], [0, 1, 0], [1.0, 0.1, 0.1]);
                }
            }

            // Register Hospital in Map Metadata
            this.map.hospital = {
                id: 'bellevue',
                name: 'Bellevue Hospital Medical Center',
                cx: cx,
                cz: cz,
                entranceX: cx,
                entranceZ: lm.z1 + 7.5,
                triageX: cx - 3.5,
                triageZ: triageZ + 1.6,
                doctorX: cx - 3.5,
                doctorZ: triageZ - 1.0,
                nurseX: cx + 0.5,
                    radius: 4.8
            };
            this.hospitalSpawn = { x: cx, z: lm.z1 - 4 };
        }

            _lmHospitalCampus(lm) {
            // Kings County Medical & Trauma Center (Campus, Trauma Center & Dedicated Roadway)
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            this.propExclusionRects.push({ x0: lm.x1 - 1.5, z0: lm.z1 - 1.5, x1: lm.x2 + 1.5, z1: lm.z2 + 1.5 });

            // Campus landscaped perimeter base
            // Rich green lawn under campus grounds
            this.fquad([lm.x1, 0.15, lm.z1], [lm.x1, 0.15, lm.z2], [lm.x2, 0.15, lm.z2], [lm.x2, 0.15, lm.z1], [0, 1, 0], col3(0x3e7a32));

            // Load hospital GLB
            this._landmarkGeos = this._landmarkGeos || {};
            const glb = (this.assets && this.assets.landmarks && this.assets.landmarks.hospital) ||
                        (this.assets && this.assets.buildings && this.assets.buildings.hospital);
            if (glb) {
                try {
                    let geo = this._landmarkGeos['hospital_campus'];
                    if (!geo) {
                        geo = glbMergedGeometry(glb.scene);
                        geo.computeBoundingBox();
                        const bb = geo.boundingBox;
                        const ox = -(bb.min.x + bb.max.x) / 2;
                        const oy = -bb.min.y;
                        const oz = -(bb.min.z + bb.max.z) / 2;
                        geo.translate(ox, oy, oz);
                        geo.computeBoundingBox();
                        this._landmarkGeos['hospital_campus'] = geo;
                    }
                    const m = new THREE.Mesh(geo, this.mat.flat);
                    m.position.set(cx, 0.10, cz);
                    m.scale.set(1.0, 1.0, 1.0);
                    m.castShadow = true;
                    m.receiveShadow = true;
                    this.root.add(m);
                    this.propMeshes.push(m);
                } catch (e) {
                    console.warn('Failed to place hospital campus GLB', e);
                }
            }

            // The hospital campus GLB includes its own built-in roadway and grounds;
            // extraneous connector curbs that cross the green lawn are omitted to keep the grounds clean.
            const roadZ = cz + 20.0;

            // Solid exterior colliders for Kings County Hospital Trauma Center (non-explorable exterior)
            // 1. Main Pavilion Base (Center X: cx, Z: cz - 2.0, W: 36.4m, H: 11.2m, D: 20.4m)
            this._collide(cx, 5.85, cz - 2.0, 36.4, 11.2, 20.4);

            // 2. Upper Patient Tower & Trauma Center (Center X: cx - 4.0, Z: cz - 4.0, W: 20.4m, H: 14.5m, D: 14.4m, tops at 25.5m)
            this._collide(cx - 4.0, 18.1, cz - 4.0, 20.4, 14.5, 14.4);

            // 3. Rooftop Helipad & Elevator Bulkhead (Center X: cx - 10.5, Z: cz - 0.5, W: 5.4m, H: 3.2m, D: 4.4m, tops at 28.5m)
            this._collide(cx - 10.5, 26.5, cz - 0.5, 5.4, 3.2, 4.4);

            // 4. East Medical Wing (Center X: cx + 26.0, Z: cz - 6.0, W: 12.4m, H: 7.6m, D: 14.4m)
            this._collide(cx + 26.0, 4.25, cz - 6.0, 12.4, 7.6, 14.4);

            // 5. Front Entrance Portico & Canopy (Center X: cx + 2.0, Z: cz + 10.1, W: 14.2m, H: 8.2m, D: 4.6m)
            this._collide(cx + 2.0, 4.6, cz + 10.1, 14.2, 8.2, 4.6);

            // 6. Front Entrance Columns (Left & Right support columns)
            this._collide(cx - 6.0, 3.7, cz + 14.75, 1.0, 7.5, 1.0);
            this._collide(cx + 10.0, 3.7, cz + 14.75, 1.0, 7.5, 1.0);

            // 7. Emergency Ambulance Canopy (Center X: cx - 23.5, Z: cz, W: 12.0m, H: 5.6m, D: 13.0m)
            this._collide(cx - 23.5, 2.8, cz, 12.0, 5.6, 13.0);

            // 8. West Campus Monument Sign
            this._collide(cx - 20.0, 1.4, cz + 15.0, 6.2, 2.8, 1.8);

            // 9. Rear Medical Service Enclosure
            this._collide(cx - 12.0, 1.1, cz - 16.5, 9.5, 2.2, 6.5);

            // 10. Parking Lot Light Poles
            this._collide(cx + 20.0, 3.0, cz + 15.0, 0.6, 6.0, 0.6);
            this._collide(cx + 34.0, 3.0, cz + 15.0, 0.6, 6.0, 0.6);

            // Register real parking stalls (2 Emergency Ambulance bays + 5 Civilian stalls)
            const hospitalStalls = [
                // 2 Emergency Ambulance Bays under the "EMERGENCY" portico
                { x: cx - 24.0, z: cz + 2.6,  heading: -Math.PI / 2, lotId: 'hospital_campus', isLotSpot: true, claimT: 0, isAmbulanceBay: true },
                { x: cx - 23.0, z: cz - 3.4,  heading: -Math.PI / 2, lotId: 'hospital_campus', isLotSpot: true, claimT: 0, isAmbulanceBay: true },
                // 5 Civilian parking stalls in the hospital lot
                { x: cx + 21.4, z: cz + 5.6,  heading: Math.PI, lotId: 'hospital_campus', isLotSpot: true, claimT: 0 },
                { x: cx + 27.0, z: cz + 5.6,  heading: Math.PI, lotId: 'hospital_campus', isLotSpot: true, claimT: 0 },
                { x: cx + 29.8, z: cz + 5.6,  heading: Math.PI, lotId: 'hospital_campus', isLotSpot: true, claimT: 0 },
                { x: cx + 24.2, z: cz + 11.4, heading: 0,       lotId: 'hospital_campus', isLotSpot: true, claimT: 0 },
                { x: cx + 32.6, z: cz + 11.4, heading: 0,       lotId: 'hospital_campus', isLotSpot: true, claimT: 0 },
            ];
            for (const s of hospitalStalls) this.map.parkedSpots.push(s);

            this.map.parkingLots = this.map.parkingLots || [];
            this.map.parkingLots.push({
                id: 'hospital_campus',
                name: 'Kings County Medical Center Parking',
                x1: lm.x1, z1: lm.z1, x2: lm.x2, z2: lm.z2,
                stalls: hospitalStalls,
                stallW: 2.5, stallL: 5.0,
                entX: cx, exitX: cx, gateZ: roadZ
            });

            // Register Hospital in Map Metadata
            this.map.hospital = {
                name: 'Kings County Hospital Trauma Center',
                cx: cx,
                cz: cz,
                triageX: cx + 2.0,
                triageZ: cz + 13.0,
                ambulanceBayX: cx - 23.5,
                ambulanceBayZ: cz,
                radius: 5.0
            };
            this.hospitalSpawn = { x: cx + 2.0, z: roadZ + 4.0 };
        }

        _lmPolice(lm) {
            // Metro Police Department Headquarters & High-Security Penitentiary Complex (120m x 90m)
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            this.propExclusionRects.push({ x0: lm.x1 - 2.0, z0: lm.z1 - 2.0, x1: lm.x2 + 2.0, z1: lm.z2 + 2.0 });

            if (this.assets && this.assets.custom && this.assets.custom.police_headquarters) {
                const hqScene = this.assets.custom.police_headquarters.scene.clone();
                const groundY = 0.12;
                hqScene.position.set(cx, groundY, cz);
                hqScene.updateMatrixWorld(true);

                hqScene.traverse((child) => {
                    if (child.isLight) {
                        child.visible = false;
                        return;
                    }
                    if (child.isMesh) {
                        if (/^collider/i.test(child.name)) {
                            child.visible = false;
                            // Skip ground box, vehicle entrance barrier/gate, and sally port tunnel gates from solid pushers for driving access
                            if (/ground|perimeter_fence_gate|vehicle_barrier|sallyport_gates/i.test(child.name)) return;

                            const posAttr = child.geometry && child.geometry.attributes && child.geometry.attributes.position;
                            if (posAttr && posAttr.count >= 36 && posAttr.count % 36 === 0) {
                                const numBoxes = posAttr.count / 36;
                                for (let b = 0; b < numBoxes; b++) {
                                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                                    for (let v = 0; v < 36; v++) {
                                        const idx = b * 36 + v;
                                        const vx = posAttr.getX(idx);
                                        const vy = posAttr.getY(idx);
                                        const vz = posAttr.getZ(idx);
                                        if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
                                        if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
                                        if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
                                    }
                                    const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
                                    if (sx > 0.05 && sz > 0.05 && sy > 0.05) {
                                        this.colliders.push({
                                            x: cx + (minX + maxX) / 2,
                                            y: groundY + (minY + maxY) / 2,
                                            z: cz + (minZ + maxZ) / 2,
                                            sx: sx, sy: sy, sz: sz
                                        });
                                    }
                                }
                            } else {
                                const box = new THREE.Box3().setFromObject(child);
                                const size = new THREE.Vector3();
                                box.getSize(size);
                                const center = new THREE.Vector3();
                                box.getCenter(center);
                                if (size.x > 0.05 && size.z > 0.05 && size.y > 0.05) {
                                    this.colliders.push({
                                        x: center.x, y: center.y, z: center.z,
                                        sx: size.x, sy: size.y, sz: size.z
                                    });
                                }
                            }
                        } else {
                            // Open vehicle access: slide open motorized security gate, raise barrier arm, and open sally port intake
                            if (/Secure motorized sliding gate/i.test(child.name)) { child.visible = false; return; }
                            if (/Vehicle barrier arm/i.test(child.name)) { child.position.y += 1.6; child.rotation.z = 1.3; }
                            if (/Sally port heavy sliding steel gate|Sally port gate ribs/i.test(child.name)) { child.visible = false; return; }
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    }
                });

                this.root.add(hqScene);

                // Register 18 Police Cruiser & Tactical Stalls in the secure fleet motor pool
                const policeStalls = [];
                for (let ox = 12; ox <= 44; ox += 4.5) {
                    policeStalls.push({ x: cx + ox, z: cz - 34.0, heading: Math.PI, lotId: 'police_hq', isLotSpot: true, claimT: 0, isPolice: true });
                }
                for (let ox = 12; ox <= 44; ox += 4.5) {
                    policeStalls.push({ x: cx + ox, z: cz - 22.0, heading: 0, lotId: 'police_hq', isLotSpot: true, claimT: 0, isPolice: true });
                }
                for (let ox = 12; ox <= 44; ox += 4.5) {
                    policeStalls.push({ x: cx + ox, z: cz - 16.0, heading: Math.PI, lotId: 'police_hq', isLotSpot: true, claimT: 0, isPolice: true });
                }
                for (const s of policeStalls) this.map.parkedSpots.push(s);

                this.map.parkingLots = this.map.parkingLots || [];
                this.map.parkingLots.push({
                    id: 'police_hq',
                    name: 'Metro Police Headquarters & Fleet Motor Pool',
                    x1: lm.x1, z1: lm.z1, x2: lm.x2, z2: lm.z2,
                    stalls: policeStalls,
                    stallW: 2.8, stallL: 5.5,
                    entX: cx + 42.0, exitX: cx + 42.0, gateZ: cz - 44.0
                });

                // Register SWAT Helipad on rooftop
                this.map.helipads = this.map.helipads || [];
                this.map.helipads.push({
                    id: 'metro_police_helipad',
                    name: 'Metro Police SWAT Rooftop Helipad',
                    x: cx - 21.0,
                    y: groundY + 20.5,
                    z: cz + 10.0,
                    radius: 12.0
                });

                // Register Police HQ metadata for interactions and dialogue
                this.map.policeHQ = {
                    id: 'metro_police_hq',
                    name: 'Metro Police Headquarters & State Penitentiary',
                    cx: cx,
                    cz: cz,
                    entranceX: cx - 21.0,
                    entranceZ: cz - 14.0,
                    deskX: cx - 21.0,
                    deskZ: cz - 11.5,
                    officerX: cx - 17.5,
                    officerZ: cz - 11.5,
                    radius: 6.0
                };

                // Player respawn when busted (Grand Ave sidewalk right outside security gate)
                this.policeSpawn = { x: cx + 42.0, z: cz - 48.0 };
                return;
            }

            // Fallback: Legacy NYPD 1st Precinct
            this._lmPrecinct(lm);
        }

        _lmPrecinct(lm) {
            // NYPD 1st Precinct (Downtown Manhattan Outpost)
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            this.propExclusionRects.push({ x0: lm.x1 - 1.5, z0: lm.z1 - 1.5, x1: lm.x2 + 1.5, z1: lm.z2 + 1.5 });

            // Ground perimeter asphalt & sidewalk base
            this.fquad([lm.x1, 0.16, lm.z1], [lm.x1, 0.16, lm.z2], [lm.x2, 0.16, lm.z2], [lm.x2, 0.16, lm.z1], [0, 1, 0], col3(0x282b30));

            // Load police_hq GLB
            this._landmarkGeos = this._landmarkGeos || {};
            const hqGlb = this.assets && this.assets.landmarks && (this.assets.landmarks.police_hq || this.assets.landmarks.police);
            if (hqGlb) {
                try {
                    let hqEntry = this._landmarkGeos.police_hq;
                    if (!hqEntry || !hqEntry.geo) {
                        const hqBuilt = glbMergedGeometry(hqGlb.scene);
                        hqBuilt.computeBoundingBox();
                        const hbb = hqBuilt.boundingBox;
                        const hox = -(hbb.min.x + hbb.max.x) / 2, hoy = -hbb.min.y, hoz = -(hbb.min.z + hbb.max.z) / 2;
                        hqBuilt.translate(hox, hoy, hoz);
                        hqBuilt.computeBoundingBox();
                        hqEntry = this._landmarkGeos.police_hq = { geo: hqBuilt, ox: hox, oy: hoy, oz: hoz };
                    }
                    const hm = new THREE.Mesh(hqEntry.geo, this.mat.flat);
                    hm.position.set(cx, 0.10, cz);
                    hm.castShadow = true;
                    hm.receiveShadow = true;
                    this.root.add(hm);
                    this.propMeshes.push(hm);
                } catch (e) { console.warn('Failed to place police_hq GLB', e); }
            }

            // Solid exterior colliders for NYPD 1st Precinct
            this._collide(cx, 7.5, cz, 18.4, 15.0, 12.4);
            this._collide(cx - 13.9, 5.0, cz - 0.5, 10.4, 10.0, 11.4);
            this._collide(cx + 13.9, 5.0, cz - 0.5, 10.4, 10.0, 11.4);
            this._collide(cx, 0.50, cz + 8.6, 13.0, 0.80, 5.2);
            this._collide(cx, 0.50, cz + 12.0, 8.0, 0.80, 1.6);
            this._collide(cx - 1.85, 3.45, cz + 10.4, 1.0, 5.3, 1.0);
            this._collide(cx + 1.85, 3.45, cz + 10.4, 1.0, 5.3, 1.0);
            this._collide(cx - 5.50, 3.45, cz + 10.4, 1.0, 5.3, 1.0);
            this._collide(cx + 5.50, 3.45, cz + 10.4, 1.0, 5.3, 1.0);
            this._collide(cx - 13.5, 4.0, cz - 10.5, 11.4, 8.0, 7.4);
            this._collide(cx + 3.0, 3.0, cz - 12.0, 18.4, 6.0, 8.4);
            this._collide(cx - 3.75, 1.1, cz - 21.0, 31.6, 2.2, 0.4);
            this._collide(cx - 19.5, 1.1, cz - 17.5, 0.4, 2.2, 7.2);
            this._collide(cx + 12.0, 1.1, cz - 14.5, 0.4, 2.2, 13.2);

            const precinctStalls = [
                { x: cx - 21.5, z: cz + 9.6, heading: Math.PI, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
                { x: cx - 18.5, z: cz + 9.6, heading: Math.PI, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
                { x: cx - 12.5, z: cz + 9.6, heading: Math.PI, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
                { x: cx - 6.0,  z: cz - 18.6, heading: 0, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
                { x: cx - 1.5,  z: cz - 18.6, heading: 0, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
                { x: cx + 3.0,  z: cz - 18.6, heading: 0, lotId: 'precinct_manhattan', isLotSpot: true, claimT: 0, isPolice: true },
            ];
            for (const s of precinctStalls) this.map.parkedSpots.push(s);
            if (!this.map.policeHQ) {
                this.map.policeHQ = {
                    id: 'nypd_1st',
                    name: 'NYPD 1st Precinct Headquarters',
                    cx: cx, cz: cz,
                    entranceX: cx, entranceZ: cz + 7.5,
                    deskX: cx, deskZ: cz + 7.5,
                    officerX: cx + 3.5, officerZ: cz + 7.5,
                    radius: 4.8
                };
                this.policeSpawn = { x: cx - 15, z: cz + 13 };
            }
        }

        _lmGunShop(lm) {
            // Ammu-Nation: 2-Story Explorable Firearms Superstore & Tactical Complex
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            const w = lm.x2 - lm.x1, d = lm.z2 - lm.z1;
            const h = 11.6;

            // Paved concrete perimeter lot
            this.fquad([lm.x1, 0.17, lm.z1], [lm.x1, 0.17, lm.z2], [lm.x2, 0.17, lm.z2], [lm.x2, 0.17, lm.z1], [0, 1, 0], col3(0x32353b));

            // Fortified gun store exterior walls (dark steel composite + red security trims)
            const steelWall = col3(0x282b33);
            const redTrim = col3(0xcc1a1a);
            const darkFloor = col3(0x1c1e22);
            const stairCol = col3(0x455a64);
            const cautionCol = col3(0xffd600);

            // Ground Floor (y = 0.18m) dark polished tactical concrete
            this.fquad([lm.x1 + 1.2, 0.18, lm.z1 + 1.2], [lm.x1 + 1.2, 0.18, lm.z2 - 1.2], [lm.x2 - 1.2, 0.18, lm.z2 - 1.2], [lm.x2 - 1.2, 0.18, lm.z1 + 1.2], [0, 1, 0], darkFloor);

            // North rear wall (solid)
            this.fbox(cx, h / 2, lm.z1 + 1.2, w, h, 2.4, steelWall);
            this._collide(cx, h / 2, lm.z1 + 1.2, w, h, 2.4);

            // West & East perimeter walls
            this.fbox(lm.x1 + 1.2, h / 2, cz, 2.4, h, d, steelWall);
            this._collide(lm.x1 + 1.2, h / 2, cz, 2.4, h, d);
            this.fbox(lm.x2 - 1.2, h / 2, cz, 2.4, h, d, steelWall);
            this._collide(lm.x2 - 1.2, h / 2, cz, 2.4, h, d);

            // South front facade with wide central entrance alcove
            const wingW = Math.max(6, (w - 12) / 2);
            this.fbox(lm.x1 + wingW / 2 + 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4, steelWall);
            this._collide(lm.x1 + wingW / 2 + 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4);
            this.fbox(lm.x2 - wingW / 2 - 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4, steelWall);
            this._collide(lm.x2 - wingW / 2 - 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4);

            // Overhanging roof slab with bold red trim
            this.fbox(cx, h + 0.35, cz, w + 1.2, 0.7, d + 1.2, col3(0x181a1f));
            this.fbox(cx, h + 0.75, cz, w + 1.5, 0.25, d + 1.5, redTrim);

            // Giant AMMU-NATION neon marquee sign across front entrance
            const signZ = lm.z2 + 0.15;
            this.neonQuad([cx - 14, h - 2.6, signZ], [cx - 14, h - 0.4, signZ], [cx + 14, h - 0.4, signZ], [cx + 14, h - 2.6, signZ], [0, 0, 1], col3(0xff2222));
            this.neonQuad([cx - 12, h - 2.1, signZ + 0.05], [cx - 12, h - 0.9, signZ + 0.05], [cx + 12, h - 0.9, signZ + 0.05], [cx + 12, h - 2.1, signZ + 0.05], [0, 0, 1], col3(0xffffff));

            // =========================================================================
            // FLOOR 1 (Ground Level): Retail Showroom, Gun Counter & 4-Lane Shooting Range
            // =========================================================================
            // Main Sales Counter (cx - 4.0, lm.z2 - 6.0)
            const counterZ = lm.z2 - 6.0;
            const counterX = cx - 4.0;
            this.fbox(counterX, 0.55, counterZ, 8.5, 1.1, 1.6, col3(0x402518));
            this._collide(counterX, 0.55, counterZ, 8.5, 1.1, 1.6);
            this.fbox(counterX, 1.12, counterZ, 8.8, 0.08, 1.8, col3(0xd4af37)); // brass countertop trim
            // Cash register & ammo cans on counter
            this.fbox(counterX - 2.2, 1.35, counterZ, 0.6, 0.38, 0.5, col3(0x1a1a1a));
            this.fbox(counterX + 2.0, 1.28, counterZ, 0.8, 0.24, 0.4, col3(0x2e4a28)); // olive ammo can

            // Glass Handgun Display Counters
            for (let gi = 0; gi < 3; gi++) {
                const gx = counterX - 12.0 + gi * 5.5;
                const gz = counterZ - 5.0;
                this.fbox(gx, 0.50, gz, 4.4, 1.0, 1.4, col3(0x1a1c22));
                this.fbox(gx, 1.02, gz, 4.4, 0.05, 1.4, col3(0xffffff));
                this.neonQuad([gx - 2.0, 1.05, gz - 0.6], [gx - 2.0, 1.05, gz + 0.6], [gx + 2.0, 1.05, gz + 0.6], [gx + 2.0, 1.05, gz - 0.6], [0, 1, 0], [0.3, 0.8, 1.0]);
                this._collide(gx, 0.50, gz, 4.4, 1.0, 1.4);
            }

            // Gun Display Racks on West back wall
            for (let r = 0; r < 4; r++) {
                const rx = lm.x1 + 6.0 + r * 6.5;
                this.fbox(rx, 3.0, lm.z1 + 2.8, 4.8, 2.4, 0.4, col3(0x1a1c22));
                this.fbox(rx, 3.0, lm.z1 + 3.1, 4.2, 0.25, 0.2, redTrim);
            }

            // Indoor 4-Lane Shooting Range (East wing: x = cx + 12 to lm.x2 - 3, z = lm.z1 + 4 to lm.z2 - 10)
            const rangeX = cx + 22.0;
            // Soundproofed partition wall separating showroom and range
            this.fbox(cx + 10.5, 2.8, cz, 0.4, 5.6, d - 8, col3(0x37474f));
            this._collide(cx + 10.5, 2.8, cz, 0.4, 5.6, d - 8);
            // Range Doorway opening at south
            this.neonQuad([cx + 10.7, 4.5, lm.z2 - 8.0], [cx + 10.7, 5.2, lm.z2 - 8.0], [cx + 10.7, 5.2, lm.z2 - 5.5], [cx + 10.7, 4.5, lm.z2 - 5.5], [1, 0, 0], [1.0, 0.85, 0.1]);

            // 4 Shooting Booth Dividers & Downrange Targets
            for (let li = 0; li < 4; li++) {
                const lx = cx + 13.0 + li * 4.2;
                // Booth divider
                this.fbox(lx, 1.4, lm.z2 - 12.0, 0.15, 2.6, 3.8, col3(0x263238));
                this.fbox(lx + 2.0, 0.55, lm.z2 - 13.5, 3.8, 1.1, 0.8, col3(0x455a64)); // shooting shelf
                this._collide(lx + 2.0, 0.55, lm.z2 - 13.5, 3.8, 1.1, 0.8);
                // Downrange Silhouette Target down at North wall
                const tz = lm.z1 + 6.0 + (li % 2) * 6.0;
                this.fbox(lx + 2.0, 1.8, tz, 0.8, 1.4, 0.05, col3(0xffffff));
                this.neonQuad([lx + 1.8, 1.6, tz - 0.04], [lx + 1.8, 2.0, tz - 0.04], [lx + 2.2, 2.0, tz - 0.04], [lx + 2.2, 1.6, tz - 0.04], [0, 0, -1], [1.0, 0.1, 0.1]);
            }

            // Industrial Steel Staircase: Ground -> Floor 2 (x = cx + 5.0, z = lm.z1 + 8 to lm.z1 + 22)
            const stairX = cx + 5.0;
            const steps = 18;
            const y0 = 0.18, y1 = 5.60;
            const rise = (y1 - y0) / steps;
            const dZ = 14.0 / steps;
            for (let i = 0; i < steps; i++) {
                const sy = y0 + (i + 1) * rise;
                const sz = lm.z1 + 8.0 + (i + 0.5) * dZ;
                this.fbox(stairX, sy - rise / 2, sz, 3.2, rise, dZ + 0.05, stairCol);
                this._collide(stairX, sy - rise / 2, sz, 3.2, rise, dZ + 0.05);
            }
            // Yellow safety railing
            this.fcyl(stairX + 1.6, 3.4, lm.z1 + 15.0, 0.04, 0.04, 15.0, 6, cautionCol);

            // =========================================================================
            // FLOOR 2 (Elevated Floor, y = 5.60m): VIP Tactical Gear, Heavy Ordnance & Armory Vault
            // =========================================================================
            // Floor 2 Slab (with stairwell cutout around stairX: x between cx + 3.0 and cx + 7.0, z from lm.z1 + 7 to lm.z1 + 23)
            const gF2W1 = (stairX - 2.0) - (lm.x1 + 1.2);
            const gF2CX1 = (lm.x1 + 1.2 + stairX - 2.0) / 2;
            this.fbox(gF2CX1, 5.42, cz, gF2W1, 0.36, d - 2.4, darkFloor);
            this._collide(gF2CX1, 5.42, cz, gF2W1, 0.36, d - 2.4);

            const gF2W2 = (lm.x2 - 1.2) - (stairX + 2.0);
            const gF2CX2 = (stairX + 2.0 + lm.x2 - 1.2) / 2;
            this.fbox(gF2CX2, 5.42, cz, gF2W2, 0.36, d - 2.4, darkFloor);
            this._collide(gF2CX2, 5.42, cz, gF2W2, 0.36, d - 2.4);

            // Ceiling neon lights Floor 2
            for (let lz = lm.z1 + 8; lz <= lm.z2 - 8; lz += 8.0) {
                this.neonQuad([cx - 10, 11.0, lz], [cx - 10, 11.0, lz + 1.4], [cx + 10, 11.0, lz + 1.4], [cx + 10, 11.0, lz], [0, -1, 0], [1.0, 0.95, 0.85]);
            }

            // VIP Tactical Gear Showroom (West wing on Floor 2): Mannequins with Body Armor
            for (let mi = 0; mi < 3; mi++) {
                const mx = lm.x1 + 8.0 + mi * 6.0;
                const mz = lm.z2 - 12.0;
                // Pedestal
                this.fbox(mx, 5.60 + 0.25, mz, 1.4, 0.5, 1.4, col3(0x1a1a1c));
                this._collide(mx, 5.60 + 0.25, mz, 1.4, 0.5, 1.4);
                // Tactical mannequin wearing Kevlar vest & helmet
                this.fbox(mx, 5.60 + 1.35, mz, 0.5, 0.9, 0.35, col3(0x2b303a));
                this.fcyl(mx, 5.60 + 2.0, mz, 0.22, 0.22, 0.35, 8, col3(0x1e222a));
            }

            // Heavy Weapon & Ordnance Display (Center-West on Floor 2)
            const ordX = cx - 10.0, ordZ = lm.z1 + 12.0;
            // Pedestal showcasing Heavy Rocket Launcher (RPG)
            this.fbox(ordX, 5.60 + 0.50, ordZ, 3.4, 1.0, 1.4, col3(0x1a1a1c));
            this._collide(ordX, 5.60 + 0.50, ordZ, 3.4, 1.0, 1.4);
            this.fcyl(ordX, 5.60 + 1.25, ordZ, 0.12, 0.12, 2.6, 8, col3(0x2e4a28)); // RPG tube
            // High-explosive ammo crates
            this.fbox(ordX + 2.8, 5.60 + 0.45, ordZ, 1.2, 0.9, 1.2, col3(0x3e2723));

            // Master Gunsmith Workshop (Center-North on Floor 2)
            const smithX = cx - 2.0, smithZ = lm.z1 + 8.0;
            this.fbox(smithX, 5.60 + 0.55, smithZ, 3.8, 1.1, 1.6, col3(0x4e342e));
            this._collide(smithX, 5.60 + 0.55, smithZ, 3.8, 1.1, 1.6);
            // Bench vice & reloading press
            this.fbox(smithX - 1.2, 5.60 + 1.3, smithZ, 0.3, 0.4, 0.3, col3(0x757575));

            // Reinforced Steel Armory Vault (East wing on Floor 2)
            const vaultX = cx + 22.0, vaultZ = cz;
            // Vault enclosure
            this.fbox(vaultX, 5.60 + 2.6, vaultZ, 12.0, 5.2, 16.0, col3(0x1a1a1c));
            this._collide(vaultX, 5.60 + 2.6, vaultZ, 12.0, 5.2, 16.0);
            // Bank-style circular vault door with combination wheel
            this.fcyl(vaultX - 6.05, 5.60 + 2.4, vaultZ, 1.4, 1.4, 0.25, 12, col3(0x757575));
            this.fcyl(vaultX - 6.25, 5.60 + 2.4, vaultZ, 0.45, 0.45, 0.15, 8, col3(0xd4af37)); // gold combination dial

            // Register shop in map metadata for interaction & HUD
            this.map.gunShops = this.map.gunShops || [];
            this.map.gunShops.push({
                id: lm.id,
                name: 'Ammu-Nation',
                cx: cx,
                cz: cz,
                counterX: counterX,
                counterZ: counterZ,
                clerkX: counterX,
                clerkZ: counterZ - 1.8,
                rangeX: cx + 18.0,
                rangeZ: lm.z2 - 12.0,
                vaultX: vaultX - 4.0,
                vaultZ: vaultZ,
                radius: 4.8,
            });
        }

        _lmFoodShop(lm) {
            // Brick-and-mortar restaurant / diner / bakery with canopy awning & patio tables
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            const w = lm.x2 - lm.x1, d = lm.z2 - lm.z1;
            const isPizza = lm.id.includes('midtown');
            const isDiner = lm.id.includes('downtown');
            const isCafe = lm.id.includes('bk');
            const h = 6.8;

            const shopName = isPizza ? "Luigi's Brick Oven Pizzeria" :
                             (isDiner ? "Downtown Classic Burger Diner" : "DUMBO Waterfront Roastery");
            const wallCol = isPizza ? col3(0x8a382a) : (isDiner ? col3(0x284f7a) : col3(0x4a3a30));
            const awnCol = isPizza ? col3(0xd82626) : (isDiner ? col3(0x2080d8) : col3(0xd88820));
            const neonCol = isPizza ? col3(0xff4444) : (isDiner ? col3(0x00e5ff) : col3(0xffaa22));

            // Paved dining terrace
            this.fquad([lm.x1, 0.17, lm.z1], [lm.x1, 0.17, lm.z2], [lm.x2, 0.17, lm.z2], [lm.x2, 0.17, lm.z1], [0, 1, 0], col3(0x4a4d55));

            // Main restaurant building walls
            this.fbox(cx, h / 2, lm.z1 + 1.2, w, h, 2.4, wallCol);
            this._collide(cx, h / 2, lm.z1 + 1.2, w, h, 2.4);
            this.fbox(lm.x1 + 1.2, h / 2, cz, 2.4, h, d, wallCol);
            this._collide(lm.x1 + 1.2, h / 2, cz, 2.4, h, d);
            this.fbox(lm.x2 - 1.2, h / 2, cz, 2.4, h, d, wallCol);
            this._collide(lm.x2 - 1.2, h / 2, cz, 2.4, h, d);

            // Front facade with entrance
            const wingW = Math.max(6, (w - 12) / 2);
            this.fbox(lm.x1 + wingW / 2 + 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4, wallCol);
            this._collide(lm.x1 + wingW / 2 + 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4);
            this.fbox(lm.x2 - wingW / 2 - 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4, wallCol);
            this._collide(lm.x2 - wingW / 2 - 1.2, h / 2, lm.z2 - 1.2, wingW, h, 2.4);

            // Roof and awning over patio entrance
            this.fbox(cx, h + 0.3, cz, w + 0.8, 0.6, d + 0.8, col3(0x222428));
            this.fbox(cx, 3.8, lm.z2 + 1.4, 15.0, 0.25, 3.2, awnCol);

            // Illuminated neon restaurant marquee
            this.neonQuad([cx - 11, h - 2.0, lm.z2 + 0.15], [cx - 11, h - 0.5, lm.z2 + 0.15], [cx + 11, h - 0.5, lm.z2 + 0.15], [cx + 11, h - 2.0, lm.z2 + 0.15], [0, 0, 1], neonCol);

            // Service counter inside
            const counterZ = lm.z2 - 5.2;
            this.fbox(cx, 0.55, counterZ, 8.0, 1.1, 1.4, col3(0x5a3822));
            this._collide(cx, 0.55, counterZ, 8.0, 1.1, 1.4);

            // Outdoor dining tables with parasol umbrellas
            const tables = [
                { x: cx - 13, z: lm.z2 - 5.0 },
                { x: cx + 13, z: lm.z2 - 5.0 }
            ];
            for (const t of tables) {
                this.fbox(t.x, 0.78, t.z, 2.4, 0.08, 2.4, col3(0x8a7a6a));
                this.fbox(t.x, 0.38, t.z, 0.22, 0.76, 0.22, col3(0x222222));
                this._collide(t.x, 0.4, t.z, 2.4, 0.8, 2.4);
                this.fbox(t.x, 1.8, t.z, 0.1, 2.1, 0.1, col3(0xd8d8d8));
                this.fbox(t.x, 2.85, t.z, 3.4, 0.18, 3.4, awnCol);
            }

            // Register food shop in map metadata
            this.map.foodShops = this.map.foodShops || [];
            this.map.foodShops.push({
                id: lm.id,
                name: shopName,
                type: isPizza ? 'pizza' : (isDiner ? 'diner' : 'cafe'),
                icon: isPizza ? '🍕' : (isDiner ? '🍔' : '☕'),
                cx, cz,
                counterX: cx,
                counterZ: counterZ + 2.0,
                radius: 5.2,
            });
        }

        _lmSpray(lm) { // Brow Auto Body — graffiti walls + hoop (pay-n-spray)
            const cx = (lm.x1 + lm.x2) / 2, cz = (lm.z1 + lm.z2) / 2;
            const w = lm.x2 - lm.x1, d = lm.z2 - lm.z1;
            // Paved yard.
            this.fquad([lm.x1, 0.17, lm.z1], [lm.x1, 0.17, lm.z2], [lm.x2, 0.17, lm.z2], [lm.x2, 0.17, lm.z1], [0, 1, 0], col3(0x6a6a70));
            // Brick walls on 3 sides (open on the north for drive-in).
            const brick = col3(0x9a6a50);
            this.fbox(cx, 1.6, lm.z1 + 0.5, w, 3.2, 1, brick);
            this.fbox(lm.x1 + 0.5, 1.6, cz, 1, 3.2, d, brick);
            this.fbox(lm.x2 - 0.5, 1.6, cz, 1, 3.2, d, brick);
            // Graffiti panels (bright colors on the inner faces).
            const rng = mulberry32(lm.x1 * 7 + lm.z1);
            for (let i = 0; i < 5; i++) {
                const hue = Math.floor(rng() * 360);
                const c = hsl2rgb(hue, 0.85, 0.55);
                const gx = lm.x1 + 4 + rng() * (w - 12), gz = lm.z1 + 1.1;
                const gw = 4 + rng() * 6;
                this.neonQuad([gx, 1.2, gz], [gx, 2.6, gz], [gx + gw, 2.6, gz], [gx + gw, 1.2, gz], [0, 0, 1], c);
            }
            for (let i = 0; i < 4; i++) {
                const hue = Math.floor(rng() * 360);
                const c = hsl2rgb(hue, 0.85, 0.55);
                const gz = lm.z1 + 4 + rng() * (d - 10);
                const gh = 3 + rng() * 5;
                this.neonQuad([lm.x1 + 1.1, 1.2, gz], [lm.x1 + 1.1, 2.6, gz], [lm.x1 + 1.1, 2.6, gz + gh], [lm.x1 + 1.1, 1.2, gz + gh], [1, 0, 0], c);
            }
            // Basketball hoop at the back wall.
            this.fbox(cx, 3.4, lm.z1 + 1.6, 0.2, 1.4, 1.0, col3(0xd8d4c8));
            this.fdisc(cx, 3.1, lm.z1 + 2.3, 0.45, 10, col3(0xd86a2a), true);
            this._collide(cx, 1.6, lm.z1 + 0.5, w, 3.2, 1);
            this._collide(lm.x1 + 0.5, 1.6, cz, 1, 3.2, d);
            this._collide(lm.x2 - 0.5, 1.6, cz, 1, 3.2, d);
            (this.sprayShops = this.sprayShops || []).push({ x: cx, z: cz, r: 14 });
        }

        _lmParking(lm) {
            this._buildParkingLot(lm);
        }

        /**
         * Dedicated Car Parking Lot with asphalt surface, perimeter curbs,
         * entrance driveway, white parking bay lines, concrete wheel stops,
         * blue "P" parking signs, ticket pay station, and floodlights.
         */
        _buildParkingLot(lm) {
            const x1 = lm.x1, z1 = lm.z1, x2 = lm.x2, z2 = lm.z2;
            const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
            const w = x2 - x1, d = z2 - z1;
            if (w < 18 || d < 18) return;

            // 1. Dark asphalt lot surface
            this.fbox(cx, 0.08, cz, w, 0.04, d, col3(0x282a2e));

            // 2. Concrete perimeter curbs with an 8.5m entrance opening on the south side
            const curbCol = col3(0x8a857a);
            const curbH = 0.32, curbW = 0.55;
            const curbY = 0.22;

            // North boundary curb (solid)
            this.fbox(cx, curbY, z1 + curbW / 2, w, curbH, curbW, curbCol);
            this._collide(cx, curbY, z1 + curbW / 2, w, curbH, curbW);

            // West boundary curb (solid)
            this.fbox(x1 + curbW / 2, curbY, cz, curbW, curbH, d, curbCol);
            this._collide(x1 + curbW / 2, curbY, cz, curbW, curbH, d);

            // East boundary curb (solid)
            this.fbox(x2 - curbW / 2, curbY, cz, curbW, curbH, d, curbCol);
            this._collide(x2 - curbW / 2, curbY, cz, curbW, curbH, d);

            // South boundary curb with central entrance/exit driveway
            const entW = 8.5;
            const wingW = Math.max(2, (w - entW) / 2);
            this.fbox(x1 + wingW / 2, curbY, z2 - curbW / 2, wingW, curbH, curbW, curbCol);
            this._collide(x1 + wingW / 2, curbY, z2 - curbW / 2, wingW, curbH, curbW);
            this.fbox(x2 - wingW / 2, curbY, z2 - curbW / 2, wingW, curbH, curbW, curbCol);
            this._collide(x2 - wingW / 2, curbY, z2 - curbW / 2, wingW, curbH, curbW);

            // Yellow entrance caution striping on asphalt (elevated above asphalt surface to eliminate z-fighting)
            this.fbox(cx, 0.108, z2 - 0.7, entW - 0.6, 0.016, 0.35, YELLOW_COLOR);
            this.fbox(cx, 0.108, z2 - 1.3, entW - 0.6, 0.016, 0.35, YELLOW_COLOR);

            // 3. Entrance "P" Parking Signpost (left of driveway)
            const postX = cx - entW / 2 - 0.8;
            const postZ = z2 - 0.8;
            this.fbox(postX, 1.3, postZ, 0.12, 2.4, 0.12, col3(0x40444a));
            // Blue signboard
            this.fbox(postX, 2.5, postZ, 0.9, 0.9, 0.08, col3(0x1a58ab));
            // White "P" symbol
            this.fbox(postX - 0.14, 2.5, postZ + 0.05, 0.12, 0.58, 0.03, col3(0xffffff));
            this.fbox(postX + 0.02, 2.68, postZ + 0.05, 0.22, 0.12, 0.03, col3(0xffffff));
            this.fbox(postX + 0.02, 2.44, postZ + 0.05, 0.22, 0.12, 0.03, col3(0xffffff));
            this.fbox(postX + 0.12, 2.56, postZ + 0.05, 0.10, 0.26, 0.03, col3(0xffffff));

            // 4. Automated Parking Ticket / Pay Station (right of driveway)
            const payX = cx + entW / 2 + 0.9;
            const payZ = z2 - 0.8;
            this.fbox(payX, 0.12, payZ, 1.1, 0.12, 1.1, curbCol);
            this.fbox(payX, 0.72, payZ, 0.6, 1.2, 0.55, col3(0x323842));
            this._collide(payX, 0.72, payZ, 0.6, 1.2, 0.55);
            this.fbox(payX, 1.05, payZ + 0.28, 0.36, 0.24, 0.02, col3(0x40b4f0)); // screen
            this.fbox(payX, 0.72, payZ + 0.28, 0.22, 0.10, 0.02, YELLOW_COLOR); // ticket slot

            // 5. Corner Security Floodlight Lamps (grounded directly on asphalt pad y = 0.10)
            this.propSpots.lamps.push({ x: x1 + 2.4, y: 0.10, z: z1 + 2.4, ry: -Math.PI * 0.75 });
            this.propSpots.lamps.push({ x: x2 - 2.4, y: 0.10, z: z1 + 2.4, ry: Math.PI * 0.75 });
            this.propSpots.lamps.push({ x: x1 + 2.4, y: 0.10, z: z2 - 2.4, ry: -Math.PI * 0.25 });
            this.propSpots.lamps.push({ x: x2 - 2.4, y: 0.10, z: z2 - 2.4, ry: Math.PI * 0.25 });

            // 6. Layout Parking Bays (Stalls)
            // North Bay Row: cars parked facing North (heading = 0)
            // South Bay Row: cars parked facing South (heading = Math.PI)
            const stallW = 3.3; // standard bay width
            const stallL = 5.4; // standard bay length
            const wheelStopCol = col3(0x948f82);
            const lineCol = col3(0xf2efe8);
            const lineY = 0.108, lineH = 0.016; // elevated above asphalt (0.10) to prevent z-fighting

            const stalls = [];
            const bayZ_north = z1 + stallL / 2 + 1.2;
            const bayZ_south = z2 - stallL / 2 - 2.2;
            const stopZ_north = z1 + 1.5;
            const stopZ_south = z2 - 2.5;

            const startX = x1 + 3.8;
            const endX = x2 - 3.8;
            const count = Math.floor((endX - startX) / stallW);

            for (let i = 0; i < count; i++) {
                const sx = startX + i * stallW + stallW / 2;

                // --- North Row Stall ---
                this.fbox(sx - stallW / 2, lineY, bayZ_north, 0.12, lineH, stallL, lineCol);
                if (i === count - 1) this.fbox(sx + stallW / 2, lineY, bayZ_north, 0.12, lineH, stallL, lineCol);
                this.fbox(sx, 0.15, stopZ_north, 2.0, 0.14, 0.24, wheelStopCol);
                this._collide(sx, 0.15, stopZ_north, 2.0, 0.14, 0.24);

                const spotN = { x: sx, z: bayZ_north, heading: 0, isLotSpot: true, lotId: lm.id, claimT: 0 };
                this.map.parkedSpots.push(spotN);
                stalls.push(spotN);

                // --- South Row Stall (leave central entrance driveway clear) ---
                if (Math.abs(sx - cx) > entW / 2 + 0.5) {
                    this.fbox(sx - stallW / 2, lineY, bayZ_south, 0.12, lineH, stallL, lineCol);
                    this.fbox(sx + stallW / 2, lineY, bayZ_south, 0.12, lineH, stallL, lineCol);
                    this.fbox(sx, 0.15, stopZ_south, 2.0, 0.14, 0.24, wheelStopCol);
                    this._collide(sx, 0.15, stopZ_south, 2.0, 0.14, 0.24);

                    const spotS = { x: sx, z: bayZ_south, heading: Math.PI, isLotSpot: true, lotId: lm.id, claimT: 0 };
                    this.map.parkedSpots.push(spotS);
                    stalls.push(spotS);
                }
            }

            // 7. Lot record, driving lanes and the automated barrier gates.
            // The single 8.5 m gap in the south kerb is a two-lane driveway:
            // inbound on the west half, outbound on the east. Both booms lie
            // along x, so a closed boom's collision box is a plain AABB.
            const laneOff = entW / 4;
            const gateZ = z2 - 3.6;                        // clear of the striping
            const armLen = entW / 2 - 0.45;
            const northLaneZ = bayZ_north + stallL / 2 + 2.6;
            const southLaneZ = bayZ_south - stallL / 2 - 2.6;
            this.map.parkingLots = this.map.parkingLots || [];
            this.map.parkingGates = this.map.parkingGates || [];
            const lot = {
                id: lm.id,
                name: lm.id === 'parking_midtown' ? 'Midtown Parking' :
                      lm.id === 'parking_fidi' ? 'Wall St Parking' :
                      lm.id === 'parking_bk' ? 'Brooklyn Car Park' :
                      lm.id === 'parking_uptown' ? 'Uptown Parking' : (lm.name || 'Car Park'),
                x1, z1, x2, z2, stalls,
                stallW, stallL,
                entX: cx - laneOff,          // inbound lane centre
                exitX: cx + laneOff,         // outbound lane centre
                gateZ,
                mouthZ: z2 + 5.5,            // a car length out into the street
                northLaneZ, southLaneZ,
                inGate: null, outGate: null,
            };
            // dirZ is the only direction a driver may legally pass through the
            // gate: -1 heading into the lot, +1 heading out of it.
            const mkGate = (kind, pivotX, along, dirZ) => {
                const tipX = pivotX + along * armLen;
                const g = {
                    lot, kind,
                    px: pivotX, pz: gateZ,
                    yaw: along > 0 ? 0 : Math.PI,          // boom runs along +x or -x
                    len: armLen,
                    sx: (pivotX + tipX) * 0.5, sz: gateZ,  // sensor centre: mid-lane
                    nx: 0, nz: dirZ,
                    bx1: Math.min(pivotX, tipX) - 0.15,
                    bx2: Math.max(pivotX, tipX) + 0.15,
                    state: 0, k: 0, t: 0, hold: 0, gi: 0,
                };
                this.map.parkingGates.push(g);
                return g;
            };
            lot.inGate = mkGate('in', cx - entW / 2 + 0.4, 1, -1);
            lot.outGate = mkGate('out', cx + entW / 2 - 0.4, -1, 1);
            for (const s of stalls) {
                s.lot = lot;
                s.w = stallW; s.len = stallL;
                s.laneZ = s.heading === 0 ? northLaneZ : southLaneZ;
            }
            this.map.parkingLots.push(lot);
        }

        _lmBull() { // Charging Bull — bronze sculpture near Wall St
            const b = BULL;
            this.fdisc(b.x, 0.18, b.z, 3, 12, col3(0x585a62), true);
            const glb = this.assets && this.assets.props.bull;
            if (glb) {
                const m = new THREE.Mesh(glbMergedGeometry(glb.scene), this.mat.flat);
                m.position.set(b.x, 0.1, b.z);
                m.rotation.y = Math.PI / 2; // face west, like the original
                m.castShadow = true;
                this.root.add(m);
                this.propMeshes.push(m);
                this._collide(b.x, 0.7, b.z, 2.8, 1.5, 1.6);
                return;
            }
            const bronze = col3(0x8a6a3a);
            this.fbox(b.x, 1.0, b.z, 2.6, 1.1, 1.2, bronze);              // body
            this.fbox(b.x - 1.5, 1.25, b.z + 0.3, 0.9, 0.8, 0.7, bronze); // head
            this.fcyl(b.x - 1.8, 1.9, b.z + 0.5, 0.1, 0.02, 0.7, 4, col3(0xd8d0b0)); // horn
            this.fcyl(b.x - 1.8, 1.9, b.z + 0.1, 0.1, 0.02, 0.7, 4, col3(0xd8d0b0)); // horn
            for (const [ox, oz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) {
                this.fbox(b.x + ox, 0.3, b.z + oz, 0.3, 0.7, 0.3, bronze);
            }
            this._collide(b.x, 0.7, b.z, 2.8, 1.5, 1.6);
        }

        _lmStatue() { // Statue of Liberty — teal figure on a star pedestal
            const s = STATUE;
            const cx = s.x, cz = s.z;
            const glb = this.assets && this.assets.props.statue_liberty;
            if (glb) {
                const m = new THREE.Mesh(glbMergedGeometry(glb.scene), this.mat.flat);
                m.position.set(cx, 0.1, cz);
                m.castShadow = true;
                this.root.add(m);
                this.propMeshes.push(m);
                this._collide(cx, 4, cz, 12, 8, 12);
                return;
            }
            const teal = col3(0x4f9a86), stone = col3(0xc9c2ae);
            // Pedestal.
            this.fbox(cx, 4, cz, 12, 8, 12, stone);
            this.fbox(cx, 8.6, cz, 9, 1.2, 9, col3(0xb8b2a0));
            // Robe.
            this.fcyl(cx, 9.2 + 7, cz, 2.6, 1.5, 14, 10, teal);
            this.fdisc(cx, 9.2, cz, 2.7, 10, teal, true);
            // Shoulders + head.
            this.fbox(cx, 23.6, cz, 2.2, 1.6, 1.6, teal);
            this.fcyl(cx, 25.7, cz, 0.75, 0.6, 1.3, 8, teal);
            this.fcyl(cx, 26.6, cz, 0.85, 0.85, 0.25, 8, col3(0xd8c98a)); // crown
            // Raised arm + torch.
            this.fbox(cx + 1.6, 27.5, cz, 0.5, 5.5, 0.5, teal);
            this.fbox(cx + 1.6, 30.6, cz, 0.7, 0.9, 0.7, col3(0xd8c98a));
            this.neonQuad([cx + 1.1, 30.4, cz - 0.4], [cx + 1.1, 31.2, cz - 0.4], [cx + 2.1, 31.2, cz + 0.4], [cx + 2.1, 30.4, cz + 0.4], [0.4, 0.8, 0.4], [1, 0.9, 0.4]);
            this._collide(cx, 4, cz, 12, 8, 12);
        }

        // ---- central park + squares ------------------------------------------------
        _buildParks() {
            const P = CENTRAL_PARK;
            const path = col3(0xb8a888), stone = col3(0xc9c2ae);
            const grassLight = col3(0x5d8a42);
            // Long walking paths.
            for (const px of [522, 662]) {
                this.fquad([px - 1.5, 0.08, 585], [px - 1.5, 0.08, 1545], [px + 1.5, 0.08, 1545], [px + 1.5, 0.08, 585], [0, 1, 0], path);
            }
            this.fquad([470, 0.08, 1058], [715, 0.08, 1058], [715, 0.08, 1062], [470, 0.08, 1062], [0, 1, 0], path);
            // Reservoir: annular rim path + deep basin bed + calm animated water.
            this.fring(P.reservoir.cx, 0.08, P.reservoir.cz, 85, 96, 36, path, true);
            this.fdisc(P.reservoir.cx, -0.50, P.reservoir.cz, 86, 36, col3(0x18242a), true);
            const resGeo = new THREE.CircleGeometry(87, 36);
            resGeo.rotateX(-Math.PI / 2);
            const resMesh = new THREE.Mesh(resGeo, this.mat.parkWater || this.mat.water);
            resMesh.position.set(P.reservoir.cx, 0.10, P.reservoir.cz);
            this.root.add(resMesh);
            this.landMeshes.push(resMesh);
            // Great Lawn + Sheep Meadow.
            this.fdisc(595, 0.065, 1220, 62, 28, grassLight, true);
            this.fdisc(595, 0.065, 1465, 62, 28, grassLight, true);
            // The Lake + Bow Bridge.
            this.fring(580, 0.075, 1365, 43, 49, 28, path, true);
            this.fdisc(580, -0.40, 1365, 44, 28, col3(0x18242a), true);
            const lakeGeo = new THREE.CircleGeometry(45, 28);
            lakeGeo.rotateX(-Math.PI / 2);
            const lakeMesh = new THREE.Mesh(lakeGeo, this.mat.parkWater || this.mat.water);
            lakeMesh.position.set(580, 0.09, 1365);
            this.root.add(lakeMesh);
            this.landMeshes.push(lakeMesh);
            // Natural pond rims: sand wash, pebbles, rocks and reeds break up
            // the perfect survey circles so the water reads as a park lake.
            {
                const rng2 = mulberry32(90910);
                const sand = col3(0xc2b280), reed = col3(0x3f6b34), rock = col3(0x6e6a62);
                const ring = (cx, cz, r, n) => {
                    for (let k = 0; k < n; k++) {
                        const a = (k / n) * Math.PI * 2 + rng2() * 0.2;
                        const rr = r + (rng2() - 0.5) * 5;
                        const px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
                        const pick2 = rng2();
                        if (pick2 < 0.4) {
                            this.fdisc(px, 0.06, pz, 1.5 + rng2() * 2, 8, tintJitter(sand, rng2, 0.07), true);
                        } else if (pick2 < 0.7) {
                            const rs = 0.8 + rng2() * 1.4;
                            this.fbox(px, rs * 0.2, pz, rs, rs * 0.7, rs, tintJitter(rock, rng2, 0.1));
                        } else {
                            for (let b = 0; b < 3; b++) {
                                this.fcyl(px + (rng2() - 0.5) * 1.6, 0.6, pz + (rng2() - 0.5) * 1.6,
                                    0.09, 0.05, 1.0 + rng2() * 0.9, 5, tintJitter(reed, rng2, 0.12));
                            }
                        }
                    }
                };
                ring(P.reservoir.cx, P.reservoir.cz, 90, 34);
                ring(580, 1365, 46, 22);
            }
            const bb = P.bowBridge;
            for (let i = 0; i < 3; i++) {
                this.fbox(bb.x - 8 + i * 8, 0.35 + Math.sin((i + 0.5) / 3 * Math.PI) * 0.5, bb.z, 8.4, 0.3, 3.2, col3(0x8a6844));
            }
            for (const sz of [-1.4, 1.4]) {
                this.fbox(bb.x, 1.1, bb.z + sz, 24, 0.12, 0.12, col3(0x5e4630));
            }
            // The Mall: promenade + double tree row.
            this.fquad([576, 0.08, P.mall[1]], [576, 0.08, P.mall[3]], [608, 0.08, P.mall[3]], [608, 0.08, P.mall[1]], [0, 1, 0], path);
            for (let z = P.mall[1] + 8; z < P.mall[3] - 4; z += 12) {
                this.propSpots.trees.push({ x: 578, z, s: 1.15, v: 0 });
                this.propSpots.trees.push({ x: 606, z, s: 1.15, v: 0 });
            }
            // Bethesda Terrace + fountain.
            this.fdisc(P.bethesda.x, 0.08, P.bethesda.z, 11, 20, path, true);
            this.fcyl(P.bethesda.x, 0.5, P.bethesda.z, 3.2, 3.4, 0.9, 14, stone);
            this.fdisc(P.bethesda.x, 0.95, P.bethesda.z, 2.8, 14, col3(0x3a70a0), true);
            this.fcyl(P.bethesda.x, 1.8, P.bethesda.z, 0.45, 0.35, 2.2, 8, stone);
            this.fdisc(P.bethesda.x, 2.9, P.bethesda.z, 1.0, 8, stone, true);
            // Scattered forest trees (rejection sampling around the features).
            const rng = mulberry32(90909);
            let placed = 0, tries = 0;
            while (placed < 190 && tries < 3000) {
                tries++;
                const x = 464 + rng() * 257, z = 589 + rng() * 947;
                const dxr = x - P.reservoir.cx, dzr = z - P.reservoir.cz;
                if (dxr * dxr + dzr * dzr < 95 * 95) continue;
                if (dist2(x, z, 595, 1220) < 66 * 66) continue;
                if (dist2(x, z, 595, 1465) < 66 * 66) continue;
                if (dist2(x, z, 580, 1365) < 48 * 48) continue;
                if (dist2(x, z, P.bethesda.x, P.bethesda.z) < 14 * 14) continue;
                if (x > 570 && x < 614 && z > P.mall[1] - 4) continue;
                if (Math.abs(x - 522) < 4 || Math.abs(x - 662) < 4) continue;
                let nearTransverse = false;
                for (const tz of TRANSVERSE_Z) if (Math.abs(z - tz) < 9) { nearTransverse = true; break; }
                if (nearTransverse) continue;
                this.propSpots.trees.push({ x, z, s: 0.9 + rng() * 0.65, v: rng() < 0.5 ? 0 : 1 });
                placed++;
            }
            // Small squares: tree rings + benches + the Washington Sq arch.
            this._buildSquares();
        }

        _buildSquares() {
            const rng = mulberry32(31337);
            for (const [x1, z1, x2, z2, kind] of PARKS) {
                if (kind !== 'square' && kind !== 'battery') continue;
                const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
                // Trees around the perimeter inset safely from roadway corridors.
                const insetX = 14, insetZ = 12;
                if (x2 - x1 > insetX * 2 + 8 && z2 - z1 > insetZ * 2 + 8) {
                    for (let x = x1 + insetX + 4; x < x2 - insetX; x += 14) {
                        this.propSpots.trees.push({ x, z: z1 + insetZ, s: 0.9 + rng() * 0.4, v: 0 });
                        this.propSpots.trees.push({ x, z: z2 - insetZ, s: 0.9 + rng() * 0.4, v: 0 });
                    }
                    for (let z = z1 + insetZ + 4; z < z2 - insetZ; z += 14) {
                        this.propSpots.trees.push({ x: x1 + insetX, z, s: 0.9 + rng() * 0.4, v: 0 });
                        this.propSpots.trees.push({ x: x2 - insetX, z, s: 0.9 + rng() * 0.4, v: 0 });
                    }
                }
                // Inner lawn disc + benches + path cross.
                this.fdisc(cx, 0.065, cz, Math.min(x2 - x1, z2 - z1) / 2 - 4, 20, col3(0x5d8a42), true);
                this.fquad([x1 + 3, 0.08, cz - 1.5], [x2 - 3, 0.08, cz - 1.5], [x2 - 3, 0.08, cz + 1.5], [x1 + 3, 0.08, cz + 1.5], [0, 1, 0], col3(0xb8a888));
                const nb = kind === 'battery' ? 8 : 4;
                for (let i = 0; i < nb; i++) {
                    const a = (i / nb) * Math.PI * 2;
                    this._bench(cx + Math.sin(a) * 12, cz + Math.cos(a) * 12, a + Math.PI / 2);
                }
            }
            // Washington Square arch (north gate, safe clearance from Broadway).
            const ax = 662, az = 2635;
            const stone = col3(0xc9c2ae);
            this.fbox(ax - 10, 7, az, 3.5, 14, 3, stone);
            this.fbox(ax + 10, 7, az, 3.5, 14, 3, stone);
            this.fbox(ax, 14.5, az, 24, 3, 3.5, stone);
            this.fbox(ax, 10, az, 17.5, 0.6, 2.6, col3(0x8a8478));
            this._collide(ax - 10, 7, az, 3.5, 14, 3);
            this._collide(ax + 10, 7, az, 3.5, 14, 3);
        }

        _bench(x, z, ry) {
            const c = Math.cos(ry), s = Math.sin(ry);
            const wood = col3(0x7a5c38), iron = col3(0x3a3a40);
            // Seat + back (oriented along local x).
            this.fbox(x, 0.45, z, 1.7, 0.07, 0.42, wood);
            this.fbox(x - s * 0.22, 0.75, z + c * 0.22, 1.7, 0.5, 0.06, wood);
            for (const ox of [-0.7, 0.7]) {
                this.fbox(x + c * ox, 0.22, z + s * ox, 0.08, 0.44, 0.36, iron);
            }
            // Solid bench: exact rotated OBB footprint so player/vehicles bump into it naturally
            this._collide(x, 0.5, z, 1.7, 1.1, 0.5, 'bench', ry);
        }

        // ---- bridges ----------------------------------------------------------------
        _buildBridges() {
            for (let i = 0; i < BRIDGES.length; i++) {
                if (BRIDGES[i].modern) {
                    this._modernBridge(BRIDGES[i], BRIDGE_DECKS[i]);
                } else {
                    this._bridge(BRIDGES[i], BRIDGE_DECKS[i]);
                }
            }
            this._buildModernBridgeJunctions();
            this._buildLibertyPlaza();
        }

        /**
         * One bridge: a single straight roadway that climbs out of the street
         * grid, runs level over the river and descends again. The running
         * surface is analytic (bridgeDeckY) so none of this is a floor
         * collider — only the parapets, columns and tower legs are, which
         * leaves every street and quay underneath fully open.
         */
        _bridge(b, d) {
            const { ax, az, ux, uz, px, pz, len, hw, ramp, gy } = d;
            const H = d.y, W = 13, UP = [0, 1, 0];
            const deckC = col3(0x3c3e44), walkC = col3(0x8e8b84), railC = col3(0x6a6e76);
            const stone = col3(0x8a8478), pierC = col3(0x5e5a54);
            /** Point at s metres along the deck, o metres across it, height y. */
            const P = (s, o, y) => [ax + ux * s + px * o, y, az + uz * s + pz * o];
            const surf = (s) => s < ramp ? gy + (H - gy) * (s / ramp)
                : s > len - ramp ? gy + (H - gy) * ((len - s) / ramp) : H;
            const knees = [0, ramp, len - ramp, len];

            // --- roadway: asphalt, flush walkway shoulders, centre stripe ---
            for (let k = 0; k < 3; k++) {
                const s0 = knees[k], s1 = knees[k + 1];
                const n = Math.max(1, Math.round((s1 - s0) / 45));
                for (let j = 0; j < n; j++) {
                    const t0 = s0 + (s1 - s0) * j / n, t1 = s0 + (s1 - s0) * (j + 1) / n;
                    const y0 = surf(t0), y1 = surf(t1);
                    this.fquadN(P(t0, -W / 2, y0), P(t1, -W / 2, y1), P(t1, W / 2, y1), P(t0, W / 2, y0), UP, deckC);
                    for (const side of [-1, 1]) {
                        this.fquadN(P(t0, side * W / 2, y0), P(t1, side * W / 2, y1),
                            P(t1, side * hw, y1), P(t0, side * hw, y0), UP, walkC);
                    }
                    this.fquadN(P(t0, -0.18, y0 + 0.02), P(t1, -0.18, y1 + 0.02),
                        P(t1, 0.18, y1 + 0.02), P(t0, 0.18, y0 + 0.02), UP, YELLOW_COLOR);
                }
                if (b.riverBridge) {
                    // Seamless asphalt transition apron from bridgehead at z = 1710 to mountain road mouth
                    this.fquadN([-756.5, 0.10, 1710], [-743.5, 0.10, 1710], [-743.56, 0.10, 1707.12], [-756.44, 0.10, 1710], UP, deckC);
                }
                // Deck slab: its sides read as fascia, its underside as soffit (no transverse internal caps across roadway).
                const m0 = P(s0, 0, surf(s0) - 0.56), m1 = P(s1, 0, surf(s1) - 0.56);
                this._beam(m0[0], m0[1], m0[2], m1[0], m1[1], m1[2], hw * 2, 1, deckC, false);
            }
            // --- parapets: one beam per straight run, one collider chain per side ---
            const rOff = hw - 0.2, rT = 0.35, rEdge = 8;   // rails stop short of the merges
            for (const side of [-1, 1]) {
                for (let k = 0; k < 3; k++) {
                    const s0 = Math.max(knees[k], rEdge), s1 = Math.min(knees[k + 1], len - rEdge);
                    if (s1 - s0 < 1) continue;
                    const p0 = P(s0, side * rOff, surf(s0) + 0.5), p1 = P(s1, side * rOff, surf(s1) + 0.5);
                    this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], rT, 1.05, railC);
                }
            }
            // Exact rotated OBB parapet colliders strictly aligned with bridge beams.
            // Zero bulging into traffic or roadway merges.
            const bridgeYaw = Math.atan2(ux, uz);
            for (const side of [-1, 1]) {
                for (let k = 0; k < 3; k++) {
                    const runS0 = Math.max(knees[k], rEdge), runS1 = Math.min(knees[k + 1], len - rEdge);
                    if (runS1 - runS0 < 1) continue;
                    const nSub = Math.max(1, Math.ceil((runS1 - runS0) / 16));
                    for (let sIdx = 0; sIdx < nSub; sIdx++) {
                        const s0 = runS0 + (runS1 - runS0) * sIdx / nSub;
                        const s1 = runS0 + (runS1 - runS0) * (sIdx + 1) / nSub;
                        const segLen = s1 - s0;
                        const yLo = Math.min(surf(s0), surf(s1)) - 0.05;
                        const yHi = Math.max(surf(s0), surf(s1)) + 1.05;
                        const c = P((s0 + s1) / 2, side * rOff, (yLo + yHi) / 2);
                        this._collide(c[0], c[1], c[2], rT, yHi - yLo, segLen, 'bridge_rail', bridgeYaw);
                    }
                }
            }
            // --- support bents: two columns + cap beam, only where the deck is
            //     high enough to clear what is underneath ---
            const cOff = hw - 1;
            for (let s = 14; s < len - 14; s += 28) {
                const y = surf(s);
                if (y < 3) continue;
                if (b.suspension && (Math.abs(s - ramp) < 9 || Math.abs(s - (len - ramp)) < 9)) continue;
                const k0 = P(s, -cOff, y - 1.45), k1 = P(s, cOff, y - 1.45);
                this._beam(k0[0], k0[1], k0[2], k1[0], k1[1], k1[2], 2.2, 0.9, pierC);
                for (const side of [-1, 1]) {
                    const c = P(s, side * cOff, 0);
                    const base = LandMask.inside(c[0], c[2]) ? 0 : -2;
                    const h = y - 1.9 - base;
                    if (h < 1) continue;
                    this.fbox(c[0], base + h / 2, c[2], 2.2, h, 2.2, pierC);
                    this._collide(c[0], base + h / 2, c[2], 2.2, h, 2.2, 'bridge');
                }
            }
            if (b.suspension) this._bridgeTowers(b, d, P, surf, stone, railC);
            else this._bridgeTruss(b, d, P);
        }

        /**
         * Suspension towers at the two knees of the profile, plus main cables
         * and hangers. The legs stand outside the roadway (even their AABB
         * corners clear it) and run down past the waterline; the cable plane is
         * the parapet plane, so hangers rise out of the rail like real ones.
         */
        _bridgeTowers(b, d, P, surf, stone, railC) {
            const len = d.len, ramp = d.ramp, H = d.y;
            const cOff = d.hw - 0.2, top = H + b.towerH, cabY = top - 1, sag = H + 6.5;
            const sT = [ramp, len - ramp];
            const capC = col3(0x6a665e);
            for (const s of sT) {
                for (const side of [-1, 1]) {
                    const c = P(s, side * cOff, 0);
                    this.fbox(c[0], (top - 2) / 2, c[2], 4, top + 2, 4, stone);
                    this._collide(c[0], (top - 2) / 2, c[2], 4, top + 2, 4, 'bridge');
                    this.fbox(c[0], top + 0.9, c[2], 4.6, 1.8, 4.6, capC);
                }
                // Portal: two spandrel beams with a pier between the arches.
                for (const y of [H + 7, H + 15]) {
                    const p0 = P(s, -cOff, y), p1 = P(s, cOff, y);
                    this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 4, 1.6, stone);
                }
                const m = P(s, 0, H + 11.4);
                this.fbox(m[0], m[1], m[2], 2.2, 6.4, 2.2, stone);
            }
            // Cable: anchorage -> saddle -> parabolic main span -> saddle -> anchorage.
            const sA = 14, yA = surf(sA) + 3.2, sB = len - sA;
            const cabAt = (s) => {
                if (s <= sT[0]) { const u = (s - sA) / (sT[0] - sA); return yA + (cabY - yA) * u - 6 * u * (1 - u); }
                if (s >= sT[1]) { const u = (sB - s) / (sB - sT[1]); return yA + (cabY - yA) * u - 6 * u * (1 - u); }
                const u = (2 * s - sT[0] - sT[1]) / (sT[1] - sT[0]);
                return sag + (cabY - sag) * u * u;
            };
            const spans = [[sA, sT[0], 8], [sT[0], sT[1], 14], [sT[1], sB, 8]];
            const bridgeYaw = Math.atan2(d.ux, d.uz);
            for (const side of [-1, 1]) {
                for (const s of [sA, sB]) {              // anchorage blocks (clear of roadway)
                    const ancOff = side * (cOff + 1.8);
                    const c = P(s, ancOff, 0);
                    this.fbox(c[0], (yA - 0.5) / 2, c[2], 4.2, yA + 0.5, 4.2, stone);
                    this._collide(c[0], (yA - 0.5) / 2, c[2], 4.2, yA + 0.5, 4.2, 'bridge', bridgeYaw);
                }
                for (const sp of spans) {
                    for (let i = 0; i < sp[2]; i++) {
                        const s0 = sp[0] + (sp[1] - sp[0]) * i / sp[2];
                        const s1 = sp[0] + (sp[1] - sp[0]) * (i + 1) / sp[2];
                        const p0 = P(s0, side * cOff, cabAt(s0)), p1 = P(s1, side * cOff, cabAt(s1));
                        this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.55, 0.55, railC);
                    }
                }
                for (let s = sA + 6; s < sB - 5; s += 10) {  // hangers
                    const yc = cabAt(s), ys = surf(s);
                    if (yc - ys < 2.5) continue;
                    const c = P(s, side * cOff, (yc + ys) / 2);
                    this.fbox(c[0], c[1], c[2], 0.18, yc - ys, 0.18, railC);
                }
            }
        }

        /**
         * Through-truss over the level span (Manhattan Bridge): chords outside
         * the roadway, alternating diagonals, overhead lateral bracing. No
         * colliders — the parapet chain already stops anything from reaching it.
         */
        _bridgeTruss(b, d, P) {
            const len = d.len, ramp = d.ramp, H = d.y;
            const off = d.hw - 0.9, topY = H + b.truss, botY = H + 0.9;
            const steelC = col3(0x50769a);
            const span = len - ramp * 2;
            const n = Math.max(4, Math.round(span / 13)), step = span / n;
            for (const side of [-1, 1]) {
                const c0 = P(ramp, side * off, topY), c1 = P(len - ramp, side * off, topY);
                this._beam(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], 0.7, 0.9, steelC);
                for (let i = 0; i <= n; i++) {
                    const s = ramp + step * i, v = P(s, side * off, (botY + topY) / 2);
                    this.fbox(v[0], v[1], v[2], 0.6, topY - botY, 0.6, steelC);
                    if (i === n) continue;
                    const up = i % 2 === 0;               // diagonals alternate per panel
                    const p0 = P(s, side * off, up ? botY : topY);
                    const p1 = P(s + step, side * off, up ? topY : botY);
                    this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.5, 0.6, steelC);
                }
            }
            for (let i = 0; i <= n; i += 2) {             // portal + top laterals
                const s = ramp + step * i;
                const p0 = P(s, -off, topY - 0.5), p1 = P(s, off, topY - 0.5);
                this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.6, 0.5, steelC);
            }
        }

        /**
         * Grand Modern Cable-Stayed & Expressway Viaduct:
         * Multi-lane highway with aerodynamic composite box girder,
         * New Jersey median safety barrier with illuminated reflectors,
         * pedestrian/bike shoulders, glass/stainless aerodynamic parapets,
         * curved high-mast LED streetlights, sculpted marine piers,
         * and soaring cable-stayed pylons with radiant stay cables.
         */
        _modernBridge(b, d) {
            const { ax, az, ux, uz, px, pz, len, hw, y0, y1, gy } = d;
            const W = b.width || 18, UP = [0, 1, 0];
            const isWide = !!b.wide; // 4-lane spine vs 2-lane ramp
            const deckC = col3(0x272a30);   // fresh performance asphalt
            const walkC = col3(0x9a9ca4);   // architectural sidewalk
            const fasciaC = col3(0xd8dbe2); // sleek white/silver aerodynamic fascia
            const steelC = col3(0x1e2228);  // dark metallic box girder underside
            const railC = col3(0x70747e);   // stainless steel railing
            const glassC = col3(0x3a6078);  // aerodynamic wind-screen tint
            const barrierC = col3(0x848892);// New Jersey concrete median barrier
            const pierC = col3(0x767a84);   // sculpted concrete marine pier
            const caissonC = col3(0x40444c);// water caisson base

            /** Point at s metres along the deck, o metres across it, height y. */
            const P = (s, o, y) => [ax + ux * s + px * o, y, az + uz * s + pz * o];
            const surf = (s) => {
                if (d.elevated) return y0 + (y1 - y0) * (s / len);
                const r = d.ramp;
                if (s < r) return gy + (d.y - gy) * (s / r);
                if (s > len - r) return gy + (d.y - gy) * ((len - s) / r);
                return d.y;
            };

            const nSteps = Math.max(2, Math.round(len / 22));
            const ds = len / nSteps;

            // --- 1. Roadway Decks & Markings ---
            for (let i = 0; i < nSteps; i++) {
                const s0 = i * ds, s1 = (i + 1) * ds;
                const ym0 = surf(s0), ym1 = surf(s1);

                if (isWide) {
                    // 4-Lane Main Spine (Westbound/Southbound lanes + Eastbound/Northbound lanes)
                    // Roadway asphalt slabs (left and right of median barrier)
                    this.fquadN(P(s0, -W / 2, ym0), P(s1, -W / 2, ym1), P(s1, -0.45, ym1), P(s0, -0.45, ym0), UP, deckC);
                    this.fquadN(P(s0, 0.45, ym0), P(s1, 0.45, ym1), P(s1, W / 2, ym1), P(s0, W / 2, ym0), UP, deckC);

                    // Raised Pedestrian / Bike Shoulders along both outer edges
                    this.fquadN(P(s0, -hw, ym0 + 0.12), P(s1, -hw, ym1 + 0.12), P(s1, -W / 2, ym1 + 0.12), P(s0, -W / 2, ym0 + 0.12), UP, walkC);
                    this.fquadN(P(s0, W / 2, ym0 + 0.12), P(s1, W / 2, ym1 + 0.12), P(s1, hw, ym1 + 0.12), P(s0, hw, ym0 + 0.12), UP, walkC);
                    // Curb risers
                    this.fquadN(P(s0, -W / 2, ym0), P(s1, -W / 2, ym1), P(s1, -W / 2, ym1 + 0.12), P(s0, -W / 2, ym0 + 0.12), [-px, 0, -pz], walkC);
                    this.fquadN(P(s0, W / 2, ym0), P(s1, W / 2, ym1), P(s1, W / 2, ym1 + 0.12), P(s0, W / 2, ym0 + 0.12), [px, 0, pz], walkC);

                    // Solid Yellow Edge Stripes
                    this.fquadN(P(s0, -W / 2 + 0.2, ym0 + 0.02), P(s1, -W / 2 + 0.2, ym1 + 0.02), P(s1, -W / 2 + 0.42, ym1 + 0.02), P(s0, -W / 2 + 0.42, ym0 + 0.02), UP, YELLOW_COLOR);
                    this.fquadN(P(s0, W / 2 - 0.42, ym0 + 0.02), P(s1, W / 2 - 0.42, ym1 + 0.02), P(s1, W / 2 - 0.2, ym1 + 0.02), P(s0, W / 2 - 0.2, ym0 + 0.02), UP, YELLOW_COLOR);

                    // Solid Yellow Median Stripes
                    this.fquadN(P(s0, -0.65, ym0 + 0.02), P(s1, -0.65, ym1 + 0.02), P(s1, -0.48, ym1 + 0.02), P(s0, -0.48, ym0 + 0.02), UP, YELLOW_COLOR);
                    this.fquadN(P(s0, 0.48, ym0 + 0.02), P(s1, 0.48, ym1 + 0.02), P(s1, 0.65, ym1 + 0.02), P(s0, 0.65, ym0 + 0.02), UP, YELLOW_COLOR);

                    // Dashed White Lane Divider Lines (separating lane 1 & 2 on each side)
                    if (i % 2 === 0) {
                        const midLaneL = -W / 4;
                        const midLaneR = W / 4;
                        const whiteC = col3(0xf0f2f5);
                        this.fquadN(P(s0, midLaneL - 0.1, ym0 + 0.02), P(s1, midLaneL - 0.1, ym1 + 0.02), P(s1, midLaneL + 0.1, ym1 + 0.02), P(s0, midLaneL + 0.1, ym0 + 0.02), UP, whiteC);
                        this.fquadN(P(s0, midLaneR - 0.1, ym0 + 0.02), P(s1, midLaneR - 0.1, ym1 + 0.02), P(s1, midLaneR + 0.1, ym1 + 0.02), P(s0, midLaneR + 0.1, ym0 + 0.02), UP, whiteC);
                    }

                    // Center Jersey Median Crash Barrier
                    this._beam(
                        ax + ux * s0, ym0 + 0.45, az + uz * s0,
                        ax + ux * s1, ym1 + 0.45, az + uz * s1,
                        0.6, 0.9, barrierC, false
                    );
                    // Median blue/amber reflector studs
                    if (i % 2 === 0) {
                        const smid = (s0 + s1) / 2;
                        const ymid = surf(smid);
                        const reflC = [0, 0.85, 1]; // glowing cyan/blue cat-eye reflector
                        this.neonQuad(
                            P(smid - 0.3, -0.32, ymid + 0.5), P(smid + 0.3, -0.32, ymid + 0.5),
                            P(smid + 0.3, -0.32, ymid + 0.65), P(smid - 0.3, -0.32, ymid + 0.65),
                            [-px, 0, -pz], reflC
                        );
                        this.neonQuad(
                            P(smid - 0.3, 0.32, ymid + 0.5), P(smid + 0.3, 0.32, ymid + 0.5),
                            P(smid + 0.3, 0.32, ymid + 0.65), P(smid - 0.3, 0.32, ymid + 0.65),
                            [px, 0, pz], reflC
                        );
                    }
                } else {
                    // 2-Lane Flyover Ramp (Canal St / Battery / Liberty Spur)
                    this.fquadN(P(s0, -W / 2, ym0), P(s1, -W / 2, ym1), P(s1, W / 2, ym1), P(s0, W / 2, ym0), UP, deckC);
                    // Walkway shoulders
                    this.fquadN(P(s0, -hw, ym0 + 0.12), P(s1, -hw, ym1 + 0.12), P(s1, -W / 2, ym1 + 0.12), P(s0, -W / 2, ym0 + 0.12), UP, walkC);
                    this.fquadN(P(s0, W / 2, ym0 + 0.12), P(s1, W / 2, ym1 + 0.12), P(s1, hw, ym1 + 0.12), P(s0, hw, ym0 + 0.12), UP, walkC);
                    // Center dividing yellow stripe
                    this.fquadN(P(s0, -0.15, ym0 + 0.02), P(s1, -0.15, ym1 + 0.02), P(s1, 0.15, ym1 + 0.02), P(s0, 0.15, ym0 + 0.02), UP, YELLOW_COLOR);
                }

                // --- 2. Aerodynamic Box Girder Underside & Sculpted White Fascias ---
                // Box girder bottom slab
                const bSoffitY0 = ym0 - 0.85, bSoffitY1 = ym1 - 0.85;
                this._beam(
                    ax + ux * s0, bSoffitY0, az + uz * s0,
                    ax + ux * s1, bSoffitY1, az + uz * s1,
                    W - 1.2, 0.9, steelC, false
                );
                // Angled aerodynamic fascia wings (white architectural composite)
                this.fquadN(P(s0, -hw, ym0), P(s1, -hw, ym1), P(s1, -W / 2 + 0.6, bSoffitY1), P(s0, -W / 2 + 0.6, bSoffitY0), [-px, -0.5, -pz], fasciaC);
                this.fquadN(P(s0, hw, ym0), P(s1, hw, ym1), P(s1, W / 2 - 0.6, bSoffitY1), P(s0, W / 2 - 0.6, bSoffitY0), [px, -0.5, pz], fasciaC);
            }

            // --- 3. Parapets, Safety Barriers & Rotated OBB Colliders ---
            const rOff = hw - 0.15;
            const rT = 0.32;
            const bridgeYaw = Math.atan2(ux, uz);
            // Check for junction gap
            // At junctions (e.g. Canal interchange at s=0/s=len), leave opening on the East (+1) side
            for (const side of [-1, 1]) {
                const isJunctionEast = (side === 1 && (b.junctionStart || b.junctionEnd));
                const railStart = (b.rampBranch && side === 1) ? 14 : (b.junctionStart && side === 1 ? 24 : 1.5);
                const railEnd = (b.junctionEnd && side === 1) ? len - 24 : len - 1.5;
                if (railEnd - railStart < 2) continue;

                // Base curb beam
                const p0 = P(railStart, side * rOff, surf(railStart) + 0.25);
                const p1 = P(railEnd, side * rOff, surf(railEnd) + 0.25);
                this._beam(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], rT, 0.5, barrierC);

                // Top stainless handrail
                const h0 = P(railStart, side * rOff, surf(railStart) + 1.05);
                const h1 = P(railEnd, side * rOff, surf(railEnd) + 1.05);
                this._beam(h0[0], h0[1], h0[2], h1[0], h1[1], h1[2], 0.2, 0.15, railC);

                // Glass aerodynamic windscreen panels
                const g0 = P(railStart, side * rOff, surf(railStart) + 0.68);
                const g1 = P(railEnd, side * rOff, surf(railEnd) + 0.68);
                this._beam(g0[0], g0[1], g0[2], g1[0], g1[1], g1[2], 0.1, 0.65, glassC);

                // Segmented OBB Colliders along rail
                const nCol = Math.max(1, Math.ceil((railEnd - railStart) / 18));
                for (let cIdx = 0; cIdx < nCol; cIdx++) {
                    const cs0 = railStart + (railEnd - railStart) * cIdx / nCol;
                    const cs1 = railStart + (railEnd - railStart) * (cIdx + 1) / nCol;
                    const segLen = cs1 - cs0;
                    const yLo = Math.min(surf(cs0), surf(cs1));
                    const yHi = Math.max(surf(cs0), surf(cs1)) + 1.15;
                    const midPt = P((cs0 + cs1) / 2, side * rOff, (yLo + yHi) / 2);
                    this._collide(midPt[0], midPt[1], midPt[2], rT, yHi - yLo, segLen, 'bridge_rail', bridgeYaw);
                }
            }

            // --- 4. High-Mast Modern Curved LED Streetlights ---
            const lightInterval = 36;
            for (let s = 18; s < len - 16; s += lightInterval) {
                const y = surf(s);
                for (const side of [-1, 1]) {
                    const basePt = P(s, side * (hw - 0.25), y + 0.12);
                    // Vertical pole (7m)
                    this._beam(basePt[0], basePt[1] + 3.5, basePt[2], basePt[0], basePt[1] + 7.0, basePt[2], 0.2, 0.2, col3(0x808590));
                    // Curved outreach arm curving in towards roadway (2.4m)
                    const armTip = P(s, side * (hw - 2.2), y + 7.3);
                    this._beam(basePt[0], basePt[1] + 7.0, basePt[2], armTip[0], armTip[1], armTip[2], 0.15, 0.15, col3(0x808590));
                    // Luminaire LED fixture head
                    this.fbox(armTip[0], armTip[1] - 0.08, armTip[2], 0.5, 0.12, 0.8, col3(0x22252a));
                    // Glowing downward LED face
                    this.neonQuad(
                        [armTip[0] - 0.2, armTip[1] - 0.14, armTip[2] - 0.35],
                        [armTip[0] + 0.2, armTip[1] - 0.14, armTip[2] - 0.35],
                        [armTip[0] + 0.2, armTip[1] - 0.14, armTip[2] + 0.35],
                        [armTip[0] - 0.2, armTip[1] - 0.14, armTip[2] + 0.35],
                        [0, -1, 0], [1.0, 0.98, 0.92]
                    );
                }
            }

            // --- 5. Support Piers & Deep-Water Caissons ---
            const pierInterval = 32;
            const pierOff = isWide ? hw * 0.55 : hw * 0.48;
            for (let s = 24; s < len - 20; s += pierInterval) {
                const y = surf(s);
                if (y < 3.2) continue; // near land descent, clear
                // If near cable-stayed pylon, skip bent
                if (b.pylon && Math.abs(s - len / 2) < 40) continue;

                // Transverse cross-head bent beam
                const k0 = P(s, -pierOff, y - 1.2), k1 = P(s, pierOff, y - 1.2);
                this._beam(k0[0], k0[1], k0[2], k1[0], k1[1], k1[2], 2.4, 1.1, pierC);

                // Twin sculpted concrete columns down to waterline
                for (const side of [-1, 1]) {
                    const c = P(s, side * pierOff, 0);
                    const isLand = LandMask.inside(c[0], c[2]);
                    const base = isLand ? 0.12 : -3.0;
                    const h = (y - 1.7) - base;
                    if (h < 1) continue;

                    // Sculpted column
                    this.fbox(c[0], base + h / 2, c[2], 2.2, h, 2.2, pierC);
                    // Marine water caisson ring at waterline (for open water)
                    if (!isLand) {
                        this.fbox(c[0], 0.3, c[2], 3.2, 1.4, 3.2, caissonC);
                    }
                    this._collide(c[0], base + h / 2, c[2], 2.4, h, 2.4, 'bridge');
                }
            }

            // --- 6. Signature Cable-Stayed Pylon (for spans marked pylon: true) ---
            if (b.pylon) {
                this._buildModernPylon(b, d, P, surf);
            }

            // --- 7. Bridgehead Seamless Ground Aprons ---
            if (b.rampStart && b.y0 <= 0.2) {
                // Smooth transition apron from ground into bridge start
                this.fquadN(
                    P(0, -hw, gy), P(0, hw, gy),
                    P(-8, hw, gy), P(-8, -hw, gy),
                    UP, deckC
                );
            }
            if (b.rampEnd && b.y1 <= 0.2) {
                // Smooth transition apron at bridge end into land
                this.fquadN(
                    P(len, -hw, gy), P(len, hw, gy),
                    P(len + 8, hw, gy), P(len + 8, -hw, gy),
                    UP, deckC
                );
            }
        }

        /**
         * Signature Modern Cable-Stayed Pylon:
         * Soaring wishbone / diamond architectural pylon (56-58m),
         * 14 pairs of stay cables fanning out in luminous cyan/white,
         * aircraft warning beacons at apex.
         */
        _buildModernPylon(b, d, P, surf) {
            const { len, hw, ux, uz, px, pz } = d;
            const midS = len / 2;
            const deckY = surf(midS);
            const towerH = b.towerH || 56;
            const apexY = deckY + towerH;
            const pylonC = col3(0xdee1e8); // brilliant white composite architectural concrete
            const cableC = col3(0x00e5ff); // luminous stay cables
            const caissonC = col3(0x3a3e46);
            const midPos = P(midS, 0, 0);

            // 1. Massive Marine Caisson Base (at water level)
            const cBaseW = (hw + 3.2) * 2;
            this.fbox(midPos[0], 0.2, midPos[2], cBaseW * Math.abs(px) + 8 * Math.abs(ux), 2.2, cBaseW * Math.abs(pz) + 8 * Math.abs(uz), caissonC);
            this._collide(midPos[0], 0.5, midPos[2], cBaseW * Math.abs(px) + 8 * Math.abs(ux), 3.0, cBaseW * Math.abs(pz) + 8 * Math.abs(uz), 'bridge');

            // 2. Twin Inclined Pylon Legs Straddling the Deck
            const legOff = hw + 1.8;
            const junctionY = deckY + 22; // height where inclined legs converge

            for (const side of [-1, 1]) {
                const foot = P(midS, side * legOff, 0.5);
                const apex = P(midS, 0, junctionY);
                // Lower leg rising from caisson through deck level to convergence point
                this._beam(foot[0], foot[1], foot[2], apex[0], apex[1], apex[2], 2.8, 3.2, pylonC);
                // Leg collision box around deck level
                this._collide(foot[0], (foot[1] + deckY) / 2, foot[2], 3.0, deckY + 4, 3.0, 'bridge');
            }

            // Lower cross-strut just below deck supporting the roadway
            const strutL = P(midS, -legOff * 0.8, deckY - 1.6);
            const strutR = P(midS, legOff * 0.8, deckY - 1.6);
            this._beam(strutL[0], strutL[1], strutL[2], strutR[0], strutR[1], strutR[2], 3.2, 2.0, pylonC);

            // Upper cross-brace below convergence
            const braceY = deckY + 14;
            const bL = P(midS, -legOff * 0.45, braceY);
            const bR = P(midS, legOff * 0.45, braceY);
            this._beam(bL[0], bL[1], bL[2], bR[0], bR[1], bR[2], 2.4, 1.4, pylonC);

            // 3. Central Soaring Spire from convergence to apex
            const pApex = P(midS, 0, apexY);
            const pJunc = P(midS, 0, junctionY);
            this._beam(pJunc[0], pJunc[1], pJunc[2], pApex[0], pApex[1], pApex[2], 3.2, 3.2, pylonC);

            // 4. Luminous Stay-Cables
            // 14 pairs of stay cables fanning from upper spire down to deck anchor brackets
            const numCables = 14;
            for (let k = 0; k < numCables; k++) {
                const u = (k + 1) / (numCables + 1);
                const towerCableY = junctionY + 4 + u * (towerH - 26);
                const deckDist = 20 + u * (len * 0.42);

                for (const side of [-1, 1]) {
                    // Fore stay cable (toward s0)
                    const sFore = midS - deckDist;
                    if (sFore > 8) {
                        const anchorFore = P(sFore, side * (hw - 0.3), surf(sFore) + 0.5);
                        this._beam(
                            midPos[0] + px * (side * 0.5), towerCableY, midPos[2] + pz * (side * 0.5),
                            anchorFore[0], anchorFore[1], anchorFore[2],
                            0.12, 0.12, cableC, false
                        );
                    }
                    // Aft stay cable (toward s1)
                    const sAft = midS + deckDist;
                    if (sAft < len - 8) {
                        const anchorAft = P(sAft, side * (hw - 0.3), surf(sAft) + 0.5);
                        this._beam(
                            midPos[0] + px * (side * 0.5), towerCableY, midPos[2] + pz * (side * 0.5),
                            anchorAft[0], anchorAft[1], anchorAft[2],
                            0.12, 0.12, cableC, false
                        );
                    }
                }
            }

            // 5. Dual Flashing Red Aircraft Warning Beacons at Apex
            const beaconRed = [1.0, 0.12, 0.12];
            this.fbox(pApex[0], apexY + 0.6, pApex[2], 0.8, 0.8, 0.8, col3(0x222222));
            this.neonQuad(
                [pApex[0] - 0.3, apexY + 1.1, pApex[2] - 0.3],
                [pApex[0] + 0.3, apexY + 1.1, pApex[2] - 0.3],
                [pApex[0] + 0.3, apexY + 1.1, pApex[2] + 0.3],
                [pApex[0] - 0.3, apexY + 1.1, pApex[2] + 0.3],
                [0, 1, 0], beaconRed
            );
        }

        /**
         * Statue of Liberty Scenic Overlook & Arrival Plaza:
         * Grand circular turnaround court at the terminus of the Liberty Island spur ramp,
         * with paved viewing promenade, central landscaped garden, fountain monument,
         * decorative lampposts, and benches looking right up at Lady Liberty.
         */
        _buildLibertyPlaza() {
            const cx = 185, cz = 3595;
            const curbC = col3(0x9a9ca4);
            const plazaC = col3(0x2e3238);
            const grassC = col3(0x386830);
            const stoneC = col3(0xc0c4cc);

            // 1. Outer paved turnaround ring & curb
            this.fring(cx, 0.14, cz, 20.0, 22.0, 32, curbC, true);
            this.fdisc(cx, 0.13, cz, 20.0, 32, plazaC, true);

            // 2. Center landscaped circular island
            this.fring(cx, 0.35, cz, 5.8, 6.8, 24, curbC, true);
            this.fdisc(cx, 0.35, cz, 5.8, 24, grassC, true);

            // 3. Central illuminated monument
            this.fcyl(cx, 1.2, cz, 2.2, 1.8, 1.8, 16, stoneC);
            this.fcyl(cx, 3.0, cz, 0.8, 0.4, 3.5, 12, col3(0x00d4ff));
            this.neonQuad(
                [cx - 0.5, 4.9, cz - 0.5], [cx + 0.5, 4.9, cz - 0.5],
                [cx + 0.5, 4.9, cz + 0.5], [cx - 0.5, 4.9, cz + 0.5],
                [0, 1, 0], [0, 0.85, 1]
            );
            this._collide(cx, 2.5, cz, 4.5, 5.0, 4.5);

            // 4. Perimeter decorative lampposts & benches
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const lx = cx + Math.cos(a) * 19.5;
                const lz = cz + Math.sin(a) * 19.5;
                this._beam(lx, 0.2, lz, lx, 4.2, lz, 0.2, 0.2, col3(0x3a404a));
                this.neonQuad(
                    [lx - 0.25, 4.2, lz - 0.25], [lx + 0.25, 4.2, lz - 0.25],
                    [lx + 0.25, 4.2, lz + 0.25], [lx - 0.25, 4.2, lz + 0.25],
                    [0, -1, 0], [1.0, 0.92, 0.75]
                );

                // Alternating benches
                if (i % 2 === 1) {
                    const bx = cx + Math.cos(a) * 18.0;
                    const bz = cz + Math.sin(a) * 18.0;
                    this.fbox(bx, 0.4, bz, 1.8, 0.5, 0.6, col3(0x6a5840));
                    this._collide(bx, 0.4, bz, 1.8, 0.5, 0.6);
                }
            }

            // 5. Perimeter protective seawall balustrade & collision barrier around ocean
            const balustradeC = col3(0xd0d4dc);
            const plazaRailC = col3(0x70747e);
            const nBal = 24;
            for (let i = 0; i < nBal; i++) {
                const a0 = (i / nBal) * Math.PI * 2;
                const a1 = ((i + 1) / nBal) * Math.PI * 2;
                const midA = (a0 + a1) / 2;
                // Leave entrance opening at south (where arrival spur connects at z > cz + 12)
                if (Math.sin(midA) > 0.65) continue;
                const rB = 20.2;
                const p0x = cx + Math.cos(a0) * rB, p0z = cz + Math.sin(a0) * rB;
                const p1x = cx + Math.cos(a1) * rB, p1z = cz + Math.sin(a1) * rB;
                // Solid stone balustrade curb (0.5m high)
                this._beam(p0x, 0.25, p0z, p1x, 0.25, p1z, 0.45, 0.5, balustradeC);
                // Top stainless handrail (1.05m high)
                this._beam(p0x, 0.95, p0z, p1x, 0.95, p1z, 0.25, 0.15, plazaRailC);
                // Protective collision box
                const segLen = Math.hypot(p1x - p0x, p1z - p0z);
                const yaw = Math.atan2(p1x - p0x, p1z - p0z);
                this._collide((p0x + p1x) / 2, 0.6, (p0z + p1z) / 2, 0.5, 1.2, segLen, 'barrier', yaw);
            }
        }

        /**
         * Seamlessly stitch consecutive modern bridge spans at shared joints:
         * - Closes all triangular wedge gaps in asphalt roadway and pedestrian sidewalks
         * - Bridges underside composite box girders and aerodynamic white fascias
         * - Connects New Jersey median barriers
         * - Bridges parapets, stainless handrails, glass screens, and rotated OBB colliders
         */
        _buildModernBridgeJunctions() {
            const UP = [0, 1, 0];
            const deckC = col3(0x272a30);
            const walkC = col3(0x9a9ca4);
            const fasciaC = col3(0xd8dbe2);
            const steelC = col3(0x1e2228);
            const railC = col3(0x70747e);
            const glassC = col3(0x3a6078);
            const barrierC = col3(0x848892);

            const modernDecks = BRIDGE_DECKS.filter(d => {
                const b = BRIDGES.find(x => x.name === d.name);
                return b && b.modern;
            });

            for (let i = 0; i < modernDecks.length; i++) {
                const dA = modernDecks[i];
                const bA = BRIDGES.find(x => x.name === dA.name);
                const endAX = dA.ax + dA.ux * dA.len;
                const endAZ = dA.az + dA.uz * dA.len;

                for (let j = 0; j < modernDecks.length; j++) {
                    if (i === j) continue;
                    const dB = modernDecks[j];
                    const bB = BRIDGES.find(x => x.name === dB.name);
                    const dist = Math.hypot(endAX - dB.ax, endAZ - dB.az);
                    if (dist > 2.0) continue;

                    const yJ = dA.elevated ? dA.y1 : (dA.ramp ? dA.gy : dA.y);
                    const WA = bA.width || 18, WB = bB.width || 18;

                    // Span A end face vertices (at s = len)
                    const PAL = [endAX - dA.px * dA.hw, yJ + 0.12, endAZ - dA.pz * dA.hw];
                    const RAL = [endAX - dA.px * (WA / 2), yJ, endAZ - dA.pz * (WA / 2)];
                    const RAR = [endAX + dA.px * (WA / 2), yJ, endAZ + dA.pz * (WA / 2)];
                    const PAR = [endAX + dA.px * dA.hw, yJ + 0.12, endAZ + dA.pz * dA.hw];

                    // Span B start face vertices (at s = 0)
                    const PBL = [dB.ax - dB.px * dB.hw, yJ + 0.12, dB.az - dB.pz * dB.hw];
                    const RBL = [dB.ax - dB.px * (WB / 2), yJ, dB.az - dB.pz * (WB / 2)];
                    const RBR = [dB.ax + dB.px * (WB / 2), yJ, dB.az + dB.pz * (WB / 2)];
                    const PBR = [dB.ax + dB.px * dB.hw, yJ + 0.12, dB.az + dB.pz * dB.hw];

                    // Box girder soffit vertices
                    const SAL = [endAX - dA.px * (WA / 2 - 0.6), yJ - 0.85, endAZ - dA.pz * (WA / 2 - 0.6)];
                    const SAR = [endAX + dA.px * (WA / 2 - 0.6), yJ - 0.85, endAZ + dA.pz * (WA / 2 - 0.6)];
                    const SBL = [dB.ax - dB.px * (WB / 2 - 0.6), yJ - 0.85, dB.az - dB.pz * (WB / 2 - 0.6)];
                    const SBR = [dB.ax + dB.px * (WB / 2 - 0.6), yJ - 0.85, dB.az + dB.pz * (WB / 2 - 0.6)];

                    // 1. Roadway Asphalt transition slab
                    this.fquadN(RAL, RAR, RBR, RBL, UP, deckC);

                    // 2. Left raised sidewalk transition slab & curb risers
                    this.fquadN(PAL, RAL, RBL, PBL, UP, walkC);
                    this.fquadN(RAL, RBL, [RBL[0], yJ + 0.12, RBL[2]], [RAL[0], yJ + 0.12, RAL[2]], [-dA.px, 0, -dA.pz], walkC);

                    // 3. Right raised sidewalk transition slab & curb risers
                    this.fquadN(RAR, PAR, PBR, RBR, UP, walkC);
                    this.fquadN(RAR, RBR, [RBR[0], yJ + 0.12, RBR[2]], [RAR[0], yJ + 0.12, RAR[2]], [dA.px, 0, dA.pz], walkC);

                    // 4. Underside Box Girder Soffit & Aerodynamic Fascias
                    this.fquadN(SAL, SAR, SBR, SBL, [0, -1, 0], steelC);
                    this.fquadN(PAL, PBL, SBL, SAL, [-dA.px, -0.5, -dA.pz], fasciaC);
                    this.fquadN(PAR, PBR, SBR, SAR, [dA.px, -0.5, dA.pz], fasciaC);

                    // 5. Center Jersey Median Barrier (when both spans have medians)
                    if (bA.wide && bB.wide) {
                        this._beam(
                            endAX, yJ + 0.45, endAZ,
                            dB.ax, yJ + 0.45, dB.az,
                            0.6, 0.9, barrierC, false
                        );
                    }

                    // 6. Parapet Safety Railings & Colliders across the joint
                    // Check if side has an interchange opening:
                    // Side -1 (Left): continuous unless branching at Liberty spur
                    const skipLeft = (bA.junctionEnd === 'liberty' && bB.libertySpur) || (bB.junctionStart === 'liberty' && bA.libertySpur);
                    if (!skipLeft && !bA.rampBranch && !bB.rampBranch) {
                        const rOffA = dA.hw - 0.15, rOffB = dB.hw - 0.15;
                        const p0x = endAX - dA.px * rOffA, p0z = endAZ - dA.pz * rOffA;
                        const p1x = dB.ax - dB.px * rOffB, p1z = dB.az - dB.pz * rOffB;
                        const segLen = Math.hypot(p1x - p0x, p1z - p0z);
                        if (segLen > 0.05) {
                            this._beam(p0x, yJ + 0.25, p0z, p1x, yJ + 0.25, p1z, 0.32, 0.5, barrierC);
                            this._beam(p0x, yJ + 1.05, p0z, p1x, yJ + 1.05, p1z, 0.2, 0.15, railC);
                            this._beam(p0x, yJ + 0.68, p0z, p1x, yJ + 0.68, p1z, 0.1, 0.65, glassC);
                            const yaw = Math.atan2(p1x - p0x, p1z - p0z);
                            this._collide((p0x + p1x) / 2, yJ + 0.6, (p0z + p1z) / 2, 0.35, 1.2, segLen, 'bridge_rail', yaw);
                        }
                    }

                    // Side +1 (Right): continuous unless branching at Canal or Battery ramp
                    const skipRight = (bA.junctionEnd === 'canal' || bB.junctionStart === 'canal' ||
                                       bA.junctionEnd === 'battery' || bB.junctionStart === 'battery');
                    if (!skipRight && !bA.rampBranch && !bB.rampBranch) {
                        const rOffA = dA.hw - 0.15, rOffB = dB.hw - 0.15;
                        const p0x = endAX + dA.px * rOffA, p0z = endAZ + dA.pz * rOffA;
                        const p1x = dB.ax + dB.px * rOffB, p1z = dB.az + dB.pz * rOffB;
                        const segLen = Math.hypot(p1x - p0x, p1z - p0z);
                        if (segLen > 0.05) {
                            this._beam(p0x, yJ + 0.25, p0z, p1x, yJ + 0.25, p1z, 0.32, 0.5, barrierC);
                            this._beam(p0x, yJ + 1.05, p0z, p1x, yJ + 1.05, p1z, 0.2, 0.15, railC);
                            this._beam(p0x, yJ + 0.68, p0z, p1x, yJ + 0.68, p1z, 0.1, 0.65, glassC);
                            const yaw = Math.atan2(p1x - p0x, p1z - p0z);
                            this._collide((p0x + p1x) / 2, yJ + 0.6, (p0z + p1z) / 2, 0.35, 1.2, segLen, 'bridge_rail', yaw);
                        }
                    }
                }
            }
        }

        // =========================================================================
        // PARADISE VALLEY & SAN ANDREAS HEIGHTS BUILDER
        // =========================================================================
        _buildParadiseAndVilla() {
            this._buildRiverPromenade();
            this._buildParadiseCity();
            this._buildVillaEstate();
        }

        /**
         * Elevated rolling hill terrain with smooth physics elevation matching Y = getTerrainElevation(x,z).
         */
        _buildParadiseHills() {
            const villaLandAsset = this.assets && (
                (this.assets.landmarks && this.assets.landmarks.villa_land) ||
                (this.assets.custom && this.assets.custom.villa_land)
            );
            if (villaLandAsset) {
                const villaLand = villaLandAsset.scene.clone();
                villaLand.position.set(-757.31, -0.40, 1537.10);
                villaLand.rotation.y = Math.PI;
                villaLand.updateMatrixWorld(true);

                let mountainRoadPos = null;
                villaLand.traverse((child) => {
                    if (child.isMesh && child.name === 'Winding_two_lane_mountain_road' && child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                        mountainRoadPos = child.geometry.attributes.position;
                    }
                });

                const visitedGeos = new Set();
                villaLand.traverse((child) => {
                    if (child.isMesh) {
                        // 1. Fix inverted mountain road & markings winding order & normals (GLB had clockwise triangles pointing downwards)
                        const isRoadPart = /mountain_road|road_edge|centerline|collider_road/i.test(child.name);
                        if (isRoadPart && child.geometry && !visitedGeos.has(child.geometry)) {
                            visitedGeos.add(child.geometry);
                            if (!child.geometry._roadNormalsFlipped) {
                                child.geometry._roadNormalsFlipped = true;
                                if (child.geometry.index) {
                                    const arr = child.geometry.index.array;
                                    for (let i = 0; i < arr.length; i += 3) {
                                        const tmp = arr[i + 1];
                                        arr[i + 1] = arr[i + 2];
                                        arr[i + 2] = tmp;
                                    }
                                    child.geometry.index.needsUpdate = true;
                                    if (child.geometry.computeVertexNormals) child.geometry.computeVertexNormals();
                                    if (child.geometry.computeBoundingBox) child.geometry.computeBoundingBox();
                                    if (child.geometry.computeBoundingSphere) child.geometry.computeBoundingSphere();
                                }
                            }
                        }

                        // 2. Ensure visible road and marking materials render DoubleSide with polygon offset
                        if (child.material) {
                            child.material.side = THREE.DoubleSide;
                            if (/centerline|road_edge/i.test(child.name)) {
                                child.material.polygonOffset = true;
                                child.material.polygonOffsetFactor = -2;
                                child.material.polygonOffsetUnits = -2;
                                child.renderOrder = 2;
                            } else if (/mountain_road|road/i.test(child.name)) {
                                child.material.polygonOffset = true;
                                child.material.polygonOffsetFactor = -1;
                                child.material.polygonOffsetUnits = -1;
                                child.renderOrder = 1;
                            }
                        }

                        // 3. Ensure terrain never pokes above the winding road surface
                        if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
                            const pos = child.geometry.attributes.position;
                            let modified = false;
                            const isTerrain = /hills|terrain/i.test(child.name);
                            const isFoliage = /foliage|pine|cypress|tree|bench|barrier/i.test(child.name);

                            if (isTerrain && mountainRoadPos) {
                                for (let i = 0; i < pos.count; i++) {
                                    const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
                                    if (lz <= -10 && lz >= -175) {
                                        for (let j = 0; j < mountainRoadPos.count; j += 4) {
                                            const rx = mountainRoadPos.getX(j), ry = mountainRoadPos.getY(j), rz = mountainRoadPos.getZ(j);
                                            if (Math.hypot(lx - rx, lz - rz) < 4.2) {
                                                if (ly >= ry - 0.05) {
                                                    pos.setY(i, ry - 0.08);
                                                    modified = true;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                            } else if (isFoliage) {
                                for (let i = 0; i < pos.count; i++) {
                                    const lz = pos.getZ(i);
                                    const wz = lz + 1380;
                                    if (wz >= 1450) {
                                        pos.setY(i, -20); // sink foliage below ground in front of villa
                                        modified = true;
                                    }
                                }
                            }
                            if (modified) {
                                pos.needsUpdate = true;
                                if (child.geometry.computeVertexNormals) child.geometry.computeVertexNormals();
                                if (child.geometry.computeBoundingBox) child.geometry.computeBoundingBox();
                                if (child.geometry.computeBoundingSphere) child.geometry.computeBoundingSphere();
                            }
                        }

                        if (/^collider/i.test(child.name)) {
                            child.visible = false;
                            // Animated villa gate (Collider_Gate): owned by
                            // VillaGateSystem. Record its world footprint for the
                            // slide-gate spec and skip the static push — a frozen
                            // collider here would bar the driveway forever.
                            if (/^collider_gate$/i.test(child.name)) {
                                const gateBox = new THREE.Box3().setFromObject(child);
                                const gateCenter = new THREE.Vector3();
                                gateBox.getCenter(gateCenter);
                                this._villaGateBox = { cx: gateCenter.x, cy: gateCenter.y, cz: gateCenter.z };
                            } else {
                            // Only real structural perimeter walls, gates, and boundary railings collide.
                            // Interior items (kitchen island, counters, tables, chairs, stools, beds, decor)
                            // and non-obstacle surfaces (roads, terrain, pads, roofs, floors, thresholds) are walk-through!
                            const isBoundaryObstacle = /perimeterwall|gate|garage.*wall|garage.*pier|balcony_rail|bridge_rail/i.test(child.name);
                            const isNonObstacle = /road|terrain|pad|transition|ground|viewpoint|guardrail|threshold|floor|roof|landing|connection|stairs|pool|mainhouse|newwing|facade/i.test(child.name);
                            if (isBoundaryObstacle && !isNonObstacle) {
                                const box = new THREE.Box3().setFromObject(child);
                                const size = new THREE.Vector3();
                                box.getSize(size);
                                const center = new THREE.Vector3();
                                box.getCenter(center);
                                if (size.x > 0.05 && size.z > 0.05 && (size.x <= 35 || size.z <= 35)) {
                                    this._collide(center.x, center.y, center.z, size.x, size.y, size.z, 'building');
                                }
                            }
                            } // end else (non-gate collider)
                        } else {
                            if (/gate[ _]motor[ _]housing/i.test(child.name || '')) {
                                child.visible = false;
                                return;
                            }
                            child.castShadow = true;
                            child.receiveShadow = true;
                            if (/hills|terrain/i.test(child.name)) {
                                this.landMeshes.push(child);
                            }
                        }
                    }
                });
                this.root.add(villaLand);
                this._villaLandBuilt = true;

                // Mountain Road Realistic Lighting System
                // Extract road centerline and edges to place authentic curved-road luminaires and embedded road studs
                let edge0 = null, edge1 = null, cl = null;
                villaLand.traverse((child) => {
                    if (child.name === 'Continuous_white_road_edge') edge0 = child;
                    if (child.name === 'Continuous_white_road_edge_1') edge1 = child;
                    if (child.name && child.name.toLowerCase().includes('centerline')) cl = child;
                });

                if (cl && edge0 && edge1 && cl.geometry && edge0.geometry && edge1.geometry) {
                    const p0 = edge0.geometry.attributes.position;
                    const p1 = edge1.geometry.attributes.position;
                    const pc = cl.geometry.attributes.position;

                    const vA = new THREE.Vector3(), vB = new THREE.Vector3();
                    const spine = [], leftEdges = [], rightEdges = [];

                    for (let i = 0; i < pc.count; i += 2) {
                        vA.fromBufferAttribute(pc, i).applyMatrix4(cl.matrixWorld);
                        vB.fromBufferAttribute(pc, i + 1).applyMatrix4(cl.matrixWorld);
                        spine.push(new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5));

                        vA.fromBufferAttribute(p0, i).applyMatrix4(edge0.matrixWorld);
                        vB.fromBufferAttribute(p0, i + 1).applyMatrix4(edge0.matrixWorld);
                        leftEdges.push(new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5));

                        vA.fromBufferAttribute(p1, i).applyMatrix4(edge1.matrixWorld);
                        vB.fromBufferAttribute(p1, i + 1).applyMatrix4(edge1.matrixWorld);
                        rightEdges.push(new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5));
                    }

                    // Reverse so index 0 is at bottom (river bridgehead) and end is at top (villa gate)
                    spine.reverse();
                    leftEdges.reverse();
                    rightEdges.reverse();

                    // 1. Place 33 physical curved-road streetlamps on alternating road shoulders
                    let accDist = 0;
                    let lampSide = 1;
                    for (let k = 0; k < spine.length; k++) {
                        if (k > 0) accDist += spine[k].distanceTo(spine[k - 1]);
                        if (accDist >= 15.5 || k === 0 || k === spine.length - 1) {
                            accDist = 0;
                            const c = spine[k];
                            const lEdge = leftEdges[k];
                            const rEdge = rightEdges[k];
                            const roadNorm = new THREE.Vector3().subVectors(lEdge, rEdge).normalize();
                            roadNorm.y = 0;

                            const edgePt = (lampSide > 0) ? lEdge : rEdge;
                            const sign = (lampSide > 0) ? 1 : -1;
                            const poleX = edgePt.x + roadNorm.x * sign * 1.4;
                            const poleZ = edgePt.z + roadNorm.z * sign * 1.4;
                            const poleY = c.y;

                            const armDir = new THREE.Vector3(c.x - poleX, 0, c.z - poleZ).normalize();
                            const ry = Math.atan2(-armDir.x, -armDir.z);

                            this.propSpots.lamps.push({
                                x: Number(poleX.toFixed(2)),
                                y: Number(poleY.toFixed(2)),
                                z: Number(poleZ.toFixed(2)),
                                ry: Number(ry.toFixed(3)),
                                mountain: true,
                            });
                            lampSide = -lampSide;
                        }
                    }

                    // Two grand entrance lamps framing the villa gate
                    this.propSpots.lamps.push({ x: -762.20, y: 29.15, z: 1536.82, ry: 0, mountain: true });
                    this.propSpots.lamps.push({ x: -752.40, y: 29.15, z: 1536.82, ry: 0, mountain: true });

                    // 2. Roadway-embedded cat's eye LED lights (centerline double-amber and edge crisp-white studs)
                    const studPts = [];
                    let studDist = 0;
                    for (let k = 0; k < spine.length; k++) {
                        if (k > 0) studDist += spine[k].distanceTo(spine[k - 1]);
                        if (studDist >= 3.2 || k === 0 || k === spine.length - 1) {
                            studDist = 0;
                            // Centerline amber guidance LED
                            studPts.push({ x: spine[k].x, y: spine[k].y + 0.038, z: spine[k].z, col: 0xffaa20, size: 0.52 });
                            // Left white edge reflective stud
                            studPts.push({ x: leftEdges[k].x, y: leftEdges[k].y + 0.038, z: leftEdges[k].z, col: 0xfff6dd, size: 0.40 });
                            // Right white edge reflective stud
                            studPts.push({ x: rightEdges[k].x, y: rightEdges[k].y + 0.038, z: rightEdges[k].z, col: 0xfff6dd, size: 0.40 });
                        }
                    }

                    let glowTex = (this.mat && this.mat.glow && this.mat.glow.map)
                        || (this.sharedMat && this.sharedMat.glow && this.sharedMat.glow.map);
                    if (!glowTex) {
                        glowTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
                            const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
                            g.addColorStop(0, 'rgba(255,255,255,0.95)');
                            g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
                            g.addColorStop(1, 'rgba(255,255,255,0)');
                            ctx.fillStyle = g;
                            ctx.fillRect(0, 0, w, h);
                        });
                    }

                    const studGeo = new THREE.PlaneGeometry(1, 1);
                    studGeo.rotateX(-Math.PI / 2);
                    const studMat = new THREE.MeshBasicMaterial({
                        map: glowTex,
                        transparent: true,
                        opacity: 0.25,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    const studMesh = new THREE.InstancedMesh(studGeo, studMat, studPts.length);
                    const dummyS = new THREE.Object3D();
                    const colorS = new THREE.Color();
                    for (let i = 0; i < studPts.length; i++) {
                        const pt = studPts[i];
                        dummyS.position.set(pt.x, pt.y, pt.z);
                        dummyS.scale.set(pt.size, pt.size, pt.size);
                        dummyS.updateMatrix();
                        studMesh.setMatrixAt(i, dummyS.matrix);
                        colorS.setHex(pt.col);
                        studMesh.setColorAt(i, colorS);
                    }
                    studMesh.instanceMatrix.needsUpdate = true;
                    studMesh.instanceColor.needsUpdate = true;
                    studMesh.frustumCulled = false;
                    studMesh.visible = true;
                    this.root.add(studMesh);
                    this.mountainRoadLightsMesh = studMesh;
                }

                // Motorized villa gate wings → world-aligned slide groups for
                // VillaGateSystem (proximity auto-open on foot, honk-to-open
                // in a car). attach() keeps each blade's world transform while
                // reparenting, so hierarchy rotations never matter. Flagged
                // villaGate so BVH indexing skips them; blocking while shut
                // is owned by the gate's own push-out.
                if (this._villaGateBox) {
                    villaLand.updateMatrixWorld(true);
                    const gb = this._villaGateBox;
                    const wingL = [], wingR = [];
                    const tmpV = new THREE.Vector3();
                    villaLand.traverse((child) => {
                        if (child.isMesh && /motorized[ _]gate/i.test(child.name || '')) {
                            child.getWorldPosition(tmpV);
                            (tmpV.x < gb.cx ? wingL : wingR).push(child);
                            child.userData.villaGate = true;
                        }
                    });
                    if (wingL.length && wingR.length) {
                        const wingHalf = 2.15;
                        const mkSlide = (offX) => {
                            const g = new THREE.Group();
                            g.position.set(gb.cx + offX, gb.cy, gb.cz);
                            this.root.add(g);
                            return g;
                        };
                        const slideL = mkSlide(-wingHalf), slideR = mkSlide(wingHalf);
                        this.root.updateMatrixWorld(true);
                        for (const m of wingL) slideL.attach(m);
                        for (const m of wingR) slideR.attach(m);
                        this.villaGate = {
                            cx: gb.cx, cz: gb.cz, cy: gb.cy,
                            slideL, slideR,
                            wingHalf: 2.15, closedOff: 2.15, slide: 4.4, lift: -0.85,
                        };
                    }
                }

                // Register VIP Villa Garage safehouse parking lot
                this.map.parkingLots = this.map.parkingLots || [];
                this.map.parkingLots.push({
                    id: 'villa_garage',
                    name: 'VIP Villa Garage',
                    x0: -777, x1: -777, x2: -765,
                    z0: 1501, z1: 1501, z2: 1513.2,
                    entX: -771, mouthZ: 1513.2,
                    bays: [
                        { x: -774.0, z: 1507.5 },
                        { x: -770.9, z: 1507.5 },
                        { x: -767.8, z: 1507.5 },
                    ],
                    stalls: [
                        { x: -774.0, z: 1507.5 },
                        { x: -770.9, z: 1507.5 },
                        { x: -767.8, z: 1507.5 },
                    ]
                });
                this._markBuilding(-790, 1485, -725, 1540);
                return;
            }
            const x0 = -1300, x1 = -260;
            const z0 = 1100, z1 = 1720;
            const step = 16;
            const nx = Math.ceil((x1 - x0) / step);
            const nz = Math.ceil((z1 - z0) / step);
            const positions = [];
            const normals = [];
            const colors = [];
            const indices = [];

            const h = (x, z) => getTerrainElevation(x, z);

            for (let j = 0; j <= nz; j++) {
                const z = z0 + (j / nz) * (z1 - z0);
                for (let i = 0; i <= nx; i++) {
                    const x = x0 + (i / nx) * (x1 - x0);
                    const y = h(x, z);
                    positions.push(x, y, z);

                    // Central difference normals
                    const eps = 2.0;
                    const dhdx = (h(x + eps, z) - h(x - eps, z)) / (2 * eps);
                    const dhdz = (h(x, z + eps) - h(x, z - eps)) / (2 * eps);
                    let nxVal = -dhdx, nyVal = 1.0, nzVal = -dhdz;
                    const len = Math.sqrt(nxVal * nxVal + nyVal * nyVal + nzVal * nzVal) || 1;
                    nxVal /= len; nyVal /= len; nzVal /= len;
                    normals.push(nxVal, nyVal, nzVal);

                    if (y >= 26.0) {
                        colors.push(0.32, 0.54, 0.28); // emerald estate turf
                    } else if (nyVal < 0.82) {
                        colors.push(0.44, 0.40, 0.35); // rocky cliff face
                    } else if (y > 10.0) {
                        colors.push(0.28, 0.48, 0.25); // rolling hillside
                    } else {
                        colors.push(0.35, 0.50, 0.26); // valley green
                    }
                }
            }

            for (let j = 0; j < nz; j++) {
                for (let i = 0; i < nx; i++) {
                    const row1 = j * (nx + 1);
                    const row2 = (j + 1) * (nx + 1);
                    const a = row1 + i;
                    const b = row1 + i + 1;
                    const c = row2 + i + 1;
                    const d = row2 + i;
                    indices.push(a, d, c, a, c, b);
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geo.setIndex(indices);

            const mesh = new THREE.Mesh(geo, this.mat.flat);
            mesh.receiveShadow = true;
            this.root.add(mesh);
            this.landMeshes.push(mesh);

            // North riverbank stone seawall skirt (z = 1720) down to -1.0
            const stoneC = col3(0x5a5448);
            for (let i = 0; i < nx; i++) {
                const xa = x0 + (i / nx) * (x1 - x0);
                const xb = x0 + ((i + 1) / nx) * (x1 - x0);
                const ya = h(xa, z1);
                const yb = h(xb, z1);
                this.fquad([xa, ya, z1], [xb, yb, z1], [xb, -1.0, z1], [xa, -1.0, z1], [0, 0, 1], stoneC);
            }
            // East cliff seawall (x = -260) down to -1.0
            for (let j = 0; j < nz; j++) {
                const za = z0 + (j / nz) * (z1 - z0);
                const zb = z0 + ((j + 1) / nz) * (z1 - z0);
                const ya = h(x1, za);
                const yb = h(x1, zb);
                this.fquad([x1, ya, za], [x1, ya, zb], [x1, -1.0, zb], [x1, -1.0, za], [1, 0, 0], stoneC);
            }
        }

        /**
         * Scenic Riverbank Promenade, Overlook Pier & Landscaped Riverwalk.
         */
        _buildRiverPromenade() {
            const paveC = col3(0xb5b0a4), copingC = col3(0x4a4740), railC = col3(0x222428);
            const woodC = col3(0x7c5332), lampPostC = col3(0x1a1c20), warmGlow = col3(0xffe6b0);
            const willowBark = col3(0x4e3e30), willowFoliage = col3(0x42753a), cherryFoliage = col3(0xde8295);

            // South Promenade along Paradise City urban waterfront (z in [1832, 1840]).
            // (North bank z = 1720 is the scenic rolling hillside of villa_land, so no artificial barrier cuts across the hill/road).
            const banks = [
                { zEdge: 1840, zIn: 1832, facing: -1, z: 1840 },
            ];

            // Leave an unobstructed 28-meter portal for Paradise River Bridge deck at x = -750
            const bridgeGapMin = -764, bridgeGapMax = -736;
            const promenadeIntervals = [
                [-1250, bridgeGapMin],
                [bridgeGapMax, -260]
            ];

            for (const b of banks) {
                for (const [xStart, xEnd] of promenadeIntervals) {
                    for (let x = xStart; x < xEnd; x += 30) {
                        const x2 = Math.min(xEnd, x + 30);
                        // Paving quad
                        this.fquad([x, 0.22, b.zIn], [x2, 0.22, b.zIn], [x2, 0.22, b.zEdge], [x, 0.22, b.zEdge], [0, 1, 0], paveC);
                        // Heavy stone coping along water edge
                        this._beam(x, 0.35, b.zEdge, x2, 0.35, b.zEdge, 0.6, 0.45, copingC);
                        // Decorative wrought iron railing
                        this._beam(x, 0.95, b.zEdge, x2, 0.95, b.zEdge, 0.15, 0.12, railC);
                        this._beam(x, 0.65, b.zEdge, x2, 0.65, b.zEdge, 0.12, 0.08, railC);
                        // Collider for railing
                        this._collide((x + x2) / 2, 0.6, b.zEdge, x2 - x, 1.2, 0.6, 'barrier');
                    }
                }

                // Vertical posts, streetlamps, benches, trees
                for (let x = -1240; x <= -270; x += 15) {
                    if (x >= bridgeGapMin - 4 && x <= bridgeGapMax + 4) continue;
                    // Railing balusters
                    this.fbox(x, 0.65, b.zEdge, 0.1, 0.7, 0.1, railC);

                    // Streetlamps every 30m
                    if (x % 30 === 0) {
                        const lz = b.zEdge + b.facing * -1.8;
                        this.fbox(x, 1.8, lz, 0.28, 3.6, 0.28, lampPostC);
                        this.fbox(x, 3.7, lz, 0.8, 0.2, 0.35, lampPostC);
                        // Twin glowing lantern heads
                        this.fbox(x - 0.35, 3.85, lz, 0.3, 0.45, 0.3, lampPostC);
                        this.fbox(x + 0.35, 3.85, lz, 0.3, 0.45, 0.3, lampPostC);
                        this.neonQuad([x - 0.45, 3.65, lz - 0.12], [x - 0.25, 3.65, lz - 0.12], [x - 0.25, 4.05, lz - 0.12], [x - 0.45, 4.05, lz - 0.12], [0, 0, -1], warmGlow);
                        this.neonQuad([x + 0.25, 3.65, lz - 0.12], [x + 0.45, 3.65, lz - 0.12], [x + 0.45, 4.05, lz - 0.12], [x + 0.25, 4.05, lz - 0.12], [0, 0, -1], warmGlow);
                    }

                    // River benches every 45m
                    if (x % 45 === 0 && Math.abs(x - (-750)) > 25) {
                        const bz = b.zEdge + b.facing * -1.4;
                        this.fbox(x, 0.48, bz, 2.2, 0.1, 0.6, woodC);
                        this.fbox(x, 0.80, bz + b.facing * 0.28, 2.2, 0.5, 0.08, woodC);
                        this.fbox(x - 0.9, 0.35, bz, 0.12, 0.7, 0.6, lampPostC);
                        this.fbox(x + 0.9, 0.35, bz, 0.12, 0.7, 0.6, lampPostC);
                        this._collide(x, 0.45, bz, 2.4, 0.9, 0.8, 'prop');
                    }

                    // Weeping willow / cherry blossom trees every 60m
                    if (x % 60 === 0 && Math.abs(x - (-750)) > 30) {
                        const tz = b.zEdge + b.facing * -4.5;
                        const isWillow = (x / 60) % 2 === 0;
                        const folC = isWillow ? willowFoliage : cherryFoliage;
                        // Trunk
                        this.fcyl(x, 2.2, tz, 0.45, 0.35, 4.4, 8, willowBark);
                        this._collide(x, 2.2, tz, 0.9, 4.4, 0.9, 'tree');
                        // Cascading foliage crown
                        this.fbox(x, 5.0, tz, 5.5, 3.0, 5.5, folC);
                        this.fbox(x, 3.8, tz + b.facing * 1.5, 6.2, 1.8, 4.5, folC);
                    }
                }
            }

            // 2. Grand River Overlook Pier at x = -520 (extending 32m into the river)
            const px = -520, pz0 = 1840, pz1 = 1808, pw = 12;
            const pierDeckC = col3(0x6e5238), pierPilingC = col3(0x3a2c20);
            // Timber deck
            this.fbox(px, 0.45, (pz0 + pz1) / 2, pw, 0.3, pz0 - pz1, pierDeckC);
            this._collide(px, 0.45, (pz0 + pz1) / 2, pw, 0.3, pz0 - pz1, 'bridge');
            // Pilings into river water
            for (let z = pz0 - 6; z >= pz1 + 2; z -= 8) {
                this.fcyl(px - pw / 2 + 1, -0.6, z, 0.4, 0.4, 2.5, 6, pierPilingC);
                this.fcyl(px + pw / 2 - 1, -0.6, z, 0.4, 0.4, 2.5, 6, pierPilingC);
            }
            // Railings around pier perimeter
            this._beam(px - pw / 2, 1.0, pz0, px - pw / 2, 1.0, pz1, 0.15, 0.12, railC);
            this._beam(px + pw / 2, 1.0, pz0, px + pw / 2, 1.0, pz1, 0.15, 0.12, railC);
            this._beam(px - pw / 2, 1.0, pz1, px + pw / 2, 1.0, pz1, 0.15, 0.12, railC);
            this._collide(px - pw / 2, 0.8, (pz0 + pz1) / 2, 0.4, 1.2, pz0 - pz1, 'barrier');
            this._collide(px + pw / 2, 0.8, (pz0 + pz1) / 2, 0.4, 1.2, pz0 - pz1, 'barrier');
            this._collide(px, 0.8, pz1, pw, 1.2, 0.4, 'barrier');

            // Open-Air White Gazebo Pavilion at pierhead
            const gzX = px, gzZ = pz1 + 6;
            const whiteC = col3(0xf4efe6), copperRoof = col3(0x458474), brassC = col3(0xc8a452);
            for (const dx of [-3.5, 3.5]) {
                for (const dz of [-3.5, 3.5]) {
                    this.fcyl(gzX + dx, 2.2, gzZ + dz, 0.28, 0.24, 3.6, 8, whiteC);
                }
            }
            // Pavilion pyramid roof
            this.fbox(gzX, 4.3, gzZ, 8.4, 0.6, 8.4, whiteC);
            this.fbox(gzX, 5.0, gzZ, 7.0, 0.8, 7.0, copperRoof);
            this.fbox(gzX, 5.6, gzZ, 4.8, 0.6, 4.8, copperRoof);
            this.fbox(gzX, 6.0, gzZ, 2.0, 0.5, 2.0, copperRoof);
            // Polished brass viewing telescopes
            this.fbox(gzX - 2.5, 1.3, gzZ - 3.2, 0.2, 0.9, 0.2, brassC);
            this.fbox(gzX - 2.5, 1.75, gzZ - 3.4, 0.18, 0.18, 0.8, brassC);
            this.fbox(gzX + 2.5, 1.3, gzZ - 3.2, 0.2, 0.9, 0.2, brassC);
            this.fbox(gzX + 2.5, 1.75, gzZ - 3.4, 0.18, 0.18, 0.8, brassC);
        }

        /**
         * Modern Organized City District (Paradise City):
         * Palm-lined boulevards, glass high-rise towers, and Grand Civic Plaza with fountains.
         */
        _buildParadiseCity() {
            const glassCyan = col3(0x2a6e8c), glassDark = col3(0x202830), whiteStucco = col3(0xf2efe9);
            const palmBark = col3(0x8a7e6e), palmFronds = col3(0x2e6e28), goldTrim = col3(0xd8b054);
            const plazaWhite = col3(0xeae5dc), fountainWater = col3(0x258da6), chromeC = col3(0xd5dde5);

            // 1. Royal Palm Trees along Boulevards
            const palmSpots = [
                // Along Grand Avenue (z = 1940)
                ...[-1180, -1100, -1020, -940, -860, -780, -700, -620, -540, -460, -380, -300].flatMap(x => [
                    { x, z: 1940 - 10 }, { x, z: 1940 + 10 }
                ]),
                // Along Ocean Boulevard (z = 2200)
                ...[-1150, -1030, -910, -790, -670, -550, -430, -310].flatMap(x => [
                    { x, z: 2200 - 9 }, { x, z: 2200 + 9 }
                ]),
                // Along Marina Way (z = 2460)
                ...[-1100, -980, -860, -740, -620, -500, -380].flatMap(x => [
                    { x, z: 2460 - 9 }, { x, z: 2460 + 9 }
                ]),
            ];

            for (const p of palmSpots) {
                // Palm trunk
                this.fcyl(p.x, 4.8, p.z, 0.38, 0.28, 9.6, 8, palmBark);
                this._collide(p.x, 2.5, p.z, 0.8, 5.0, 0.8, 'tree');
                // Cascading tropical palm canopy
                this.fbox(p.x, 10.0, p.z, 4.8, 1.2, 4.8, palmFronds);
                this.fbox(p.x, 9.2, p.z, 6.2, 0.8, 6.2, palmFronds);
                // Modern concrete tree well planter box
                this.fbox(p.x, 0.22, p.z, 2.2, 0.4, 2.2, whiteStucco);
            }

            // 2. Modern Glass Towers & High-Rises
            // Tower 1: Paradise Sky Tower (x = -400, z = 2125, h = 82m)
            const t1X = -400, t1Z = 2125;
            this.fbox(t1X, 41, t1Z, 46, 82, 46, glassCyan);
            this._collide(t1X, 41, t1Z, 46, 82, 46, 'building');
            // White exoskeleton corner columns
            for (const dx of [-23, 23]) {
                for (const dz of [-23, 23]) {
                    this.fbox(t1X + dx, 42, t1Z + dz, 2.6, 84, 2.6, whiteStucco);
                }
            }
            // Rooftop needle spire
            this.fcyl(t1X, 94, t1Z, 1.8, 0.3, 26, 8, chromeC);
            this.neonQuad([t1X - 0.5, 106.5, t1Z], [t1X + 0.5, 106.5, t1Z], [t1X + 0.5, 107.5, t1Z], [t1X - 0.5, 107.5, t1Z], [0, 0, 1], col3(0xff3b30));

            // Tower 2: Azure Luxury Residences (x = -580, z = 2320, h = 66m)
            const t2X = -580, t2Z = 2320;
            this.fbox(t2X, 33, t2Z, 42, 66, 38, glassDark);
            this._collide(t2X, 33, t2Z, 42, 66, 38, 'building');
            // Wrap-around white balconies every 4 meters
            for (let y = 6; y < 66; y += 4) {
                this.fbox(t2X, y, t2Z, 45, 0.5, 41, whiteStucco);
                this.fbox(t2X, y + 0.5, t2Z - 20.5, 45, 0.8, 0.2, glassCyan);
                this.fbox(t2X, y + 0.5, t2Z + 20.5, 45, 0.8, 0.2, glassCyan);
            }

            // Tower 3: Palisades Corporate Headquarters (x = -880, z = 2050, h = 60m)
            const t3X = -880, t3Z = 2050;
            this.fbox(t3X, 30, t3Z, 44, 60, 44, col3(0x363c44));
            this._collide(t3X, 30, t3Z, 44, 60, 44, 'building');
            // Horizontal bronze louvers
            for (let y = 8; y < 60; y += 4) {
                this.fbox(t3X, y, t3Z, 45.5, 0.4, 45.5, goldTrim);
            }
            // Double-height illuminated glass atrium entrance
            this.fbox(t3X, 4, t3Z + 22.5, 20, 8, 4, glassCyan);

            // Tower 4: Marina Bay Twin Towers with Skybridge (x = -1040, z = 2320)
            const t4aX = -1058, t4bX = -1022, t4Z = 2320;
            this.fbox(t4aX, 28, t4Z, 26, 56, 34, glassCyan);
            this.fbox(t4bX, 28, t4Z, 26, 56, 34, glassCyan);
            this._collide(t4aX, 28, t4Z, 26, 56, 34, 'building');
            this._collide(t4bX, 28, t4Z, 26, 56, 34, 'building');
            // Skybridge at floor 10 (y = 38m)
            this.fbox((t4aX + t4bX) / 2, 38, t4Z, 16, 4.5, 8, whiteStucco);
            this.fbox((t4aX + t4bX) / 2, 38, t4Z - 4.1, 14, 3.2, 0.2, glassCyan);
            this.fbox((t4aX + t4bX) / 2, 38, t4Z + 4.1, 14, 3.2, 0.2, glassCyan);

            // 3. Grand Civic Plaza & Fountains (x in [-680, -600], z in [2010, 2090])
            const plX = -640, plZ = 2050;
            // White granite plaza floor
            this.fquad([plX - 38, 0.22, plZ - 38], [plX + 38, 0.22, plZ - 38], [plX + 38, 0.22, plZ + 38], [plX - 38, 0.22, plZ + 38], [0, 1, 0], plazaWhite);

            // 2-Tier Central Illuminated Fountain
            // Outer pool ring
            this.fcyl(plX, 0.45, plZ, 9.0, 9.0, 0.8, 16, whiteStucco);
            this.fcyl(plX, 0.55, plZ, 8.4, 8.4, 0.2, 16, fountainWater);
            this.neonQuad([plX - 3, 0.58, plZ - 3], [plX + 3, 0.58, plZ - 3], [plX + 3, 0.58, plZ + 3], [plX - 3, 0.58, plZ + 3], [0, 1, 0], col3(0x18c8e8));
            this._collide(plX, 0.45, plZ, 18, 0.9, 18, 'prop');

            // Upper tier bowl & jet
            this.fcyl(plX, 1.5, plZ, 4.2, 4.6, 1.2, 12, whiteStucco);
            this.fcyl(plX, 2.15, plZ, 4.0, 4.0, 0.15, 12, fountainWater);
            this.fcyl(plX, 3.2, plZ, 0.4, 0.15, 2.0, 8, col3(0xd8f0ff)); // shimmering water spray jet

            // Abstract Polished Chrome Ribbon Sculpture
            this._beam(plX - 16, 0.3, plZ + 14, plX - 12, 6.0, plZ + 18, 0.8, 0.4, chromeC);
            this._beam(plX - 12, 6.0, plZ + 18, plX - 8, 11.0, plZ + 12, 0.8, 0.4, chromeC);
            this._beam(plX - 8, 11.0, plZ + 12, plX - 14, 6.0, plZ + 8, 0.8, 0.4, chromeC);
            this._beam(plX - 14, 6.0, plZ + 8, plX - 16, 0.3, plZ + 14, 0.8, 0.4, chromeC);
        }

        /**
         * VIP Modern Luxury Villa on the Hill Summit (y = 28.0m):
         * Gated grounds, motor court fountain, 4-car garage with vehicle save & workshop,
         * cantilevered infinity pool deck, sunken fire pit, and fully furnished Bauhaus interior.
         */
        _buildVillaEstate() {
            if (this._villaLandBuilt) return;
            if (this.assets && this.assets.custom && this.assets.custom.villa_estate) {
                const villa = this.assets.custom.villa_estate.scene.clone();
                villa.position.set(-745, 28.0, 1380);
                villa.updateMatrixWorld(true);
                villa.traverse((child) => {
                    if (child.isMesh) {
                        if (/^collider/i.test(child.name)) {
                            child.visible = false;
                            const box = new THREE.Box3().setFromObject(child);
                            const size = new THREE.Vector3();
                            box.getSize(size);
                            const center = new THREE.Vector3();
                            box.getCenter(center);
                            if (size.x > 0.05 && size.z > 0.05) {
                                this.colliders.push({
                                    x: center.x, y: center.y, z: center.z,
                                    sx: size.x, sy: size.y, sz: size.z
                                });
                            }
                        } else {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    }
                });
                this.villa = villa;
                this.root.add(villa);
                this.map.parkingLots.push({
                    x: -745, z: 1395, radius: 18, name: 'VIP Villa Garage'
                });
                return;
            }
            const vy = 28.0; // summit plateau elevation
            const vX = -745, vZ = 1405; // estate center

            // Architectural Materials Palette
            const stuccoW = col3(0xf6f3eb), travStone = col3(0xe0d6c5), teakWood = col3(0x8a5832);
            const steelBlack = col3(0x1e2024), fasciaGrey = col3(0x2c2f35), glassCyan = col3(0x2884a0);
            const glassClear = col3(0x6ba8b8), grassGreen = col3(0x32562b), poolTurquoise = col3(0x19b8d2);
            const fireOrange = col3(0xff7718), chromeSilver = col3(0xd8dee4), oakHardwood = col3(0x785338);
            const marbleWhite = col3(0xedeae4), leatherGrey = col3(0x3e4248), navyBed = col3(0x243548);
            const redTool = col3(0xd32f2f), yellowStripe = col3(0xffd700), fountainWater = col3(0x258da6);

            // =====================================================================
            // 1. ESTATE GROUNDS & MOTOR COURT
            // =====================================================================
            // Perimeter grounds lawn
            this.fquadN([vX - 68, vy + 0.02, vZ - 60], [vX + 68, vy + 0.02, vZ - 60],
                       [vX + 68, vy + 0.02, vZ + 60], [vX - 68, vy + 0.02, vZ + 60], [0, 1, 0], grassGreen);

            // Perimeter privacy wall with dark coping
            const wallH = 2.4;
            const wX0 = vX - 68, wX1 = vX + 68, wZ0 = vZ - 60, wZ1 = vZ + 60;
            // North, East, West walls
            this._beam(wX0, vy + wallH / 2, wZ0, wX1, vy + wallH / 2, wZ0, 0.45, wallH, travStone);
            this._beam(wX1, vy + wallH / 2, wZ0, wX1, vy + wallH / 2, wZ1, 0.45, wallH, travStone);
            this._beam(wX0, vy + wallH / 2, wZ0, wX0, vy + wallH / 2, wZ1, 0.45, wallH, travStone);
            this._collide((wX0 + wX1) / 2, vy + wallH / 2, wZ0, wX1 - wX0, wallH, 0.5, 'fence');
            this._collide(wX1, vy + wallH / 2, (wZ0 + wZ1) / 2, 0.5, wallH, wZ1 - wZ0, 'fence');
            this._collide(wX0, vy + wallH / 2, (wZ0 + wZ1) / 2, 0.5, wallH, wZ1 - wZ0, 'fence');

            // South wall with 12m wide grand entrance gate
            const gateL = vX - 6, gateR = vX + 6;
            this._beam(wX0, vy + wallH / 2, wZ1, gateL, vy + wallH / 2, wZ1, 0.45, wallH, travStone);
            this._beam(gateR, vy + wallH / 2, wZ1, wX1, vy + wallH / 2, wZ1, 0.45, wallH, travStone);
            this._collide((wX0 + gateL) / 2, vy + wallH / 2, wZ1, gateL - wX0, wallH, 0.5, 'fence');
            this._collide((gateR + wX1) / 2, vy + wallH / 2, wZ1, wX1 - gateR, wallH, 0.5, 'fence');

            // Security Gate Pillars at entrance
            for (const gx of [gateL, gateR]) {
                this.fbox(gx, vy + 2.2, wZ1, 1.4, 4.4, 1.4, travStone);
                this.fbox(gx, vy + 4.5, wZ1, 1.7, 0.3, 1.7, steelBlack);
                this.neonQuad([gx - 0.4, vy + 3.0, wZ1 + 0.72], [gx + 0.4, vy + 3.0, wZ1 + 0.72],
                              [gx + 0.4, vy + 3.6, wZ1 + 0.72], [gx - 0.4, vy + 3.6, wZ1 + 0.72], [0, 0, 1], col3(0xffe29d));
                this._collide(gx, vy + 2.2, wZ1, 1.5, 4.4, 1.5, 'prop');
            }
            // Motorized sliding security gate: two slatted wings on
            // world-aligned slide groups. Deliberately NOT baked into chunk
            // geometry via _beam — VillaGateSystem animates these every
            // frame (proximity auto-open on foot, honk-to-open in a car).
            // Wing meshes are flagged villaGate so BVH indexing skips them;
            // blocking while closed is owned by the gate's own push-out.
            const gateMat = new THREE.MeshLambertMaterial({ color: 0x23262b });
            const gateRailMat = new THREE.MeshLambertMaterial({ color: 0x3d4148 });
            const wingSlatGeo = new THREE.BoxGeometry(6.0, 0.22, 0.08);
            const wingRailGeo = new THREE.BoxGeometry(6.0, 0.14, 0.12);
            const wingStileGeo = new THREE.BoxGeometry(0.14, 2.2, 0.12);
            const mkGateWing = (cx) => {
                const g = new THREE.Group();
                g.position.set(cx, vy, wZ1);
                for (let i = 0; i < 7; i++) {
                    const s = new THREE.Mesh(wingSlatGeo, gateMat);
                    s.position.set(0, 0.45 + i * 0.30, 0);
                    s.castShadow = true;
                    s.userData.villaGate = true;
                    g.add(s);
                }
                for (const ry of [0.28, 2.32]) {
                    const r = new THREE.Mesh(wingRailGeo, gateRailMat);
                    r.position.set(0, ry, 0);
                    r.castShadow = true;
                    r.userData.villaGate = true;
                    g.add(r);
                }
                for (const sx of [-2.93, 2.93]) {
                    const st = new THREE.Mesh(wingStileGeo, gateRailMat);
                    st.position.set(sx, 1.3, 0);
                    st.castShadow = true;
                    st.userData.villaGate = true;
                    g.add(st);
                }
                this.root.add(g);
                return g;
            };
            this.villaGate = {
                cx: vX, cz: wZ1, cy: vy,
                slideL: mkGateWing(gateL + 3), slideR: mkGateWing(gateR - 3),
                wingHalf: 3.0, closedOff: 3.0, slide: 5.9, lift: 0.85,
            };

            // Circular Cobblestone Motor Court
            const mcX = vX, mcZ = vZ + 32, mcR = 14;
            this.fdisc(mcX, vy + 0.04, mcZ, mcR, 24, col3(0x5a5b5e), true);
            // Central Circular Stone Planter with Fountain & Palm Tree
            this.fcyl(mcX, vy + 0.45, mcZ, 4.2, 4.2, 0.8, 16, travStone);
            this.fcyl(mcX, vy + 0.55, mcZ, 3.6, 3.6, 0.2, 16, fountainWater);
            this.neonQuad([mcX - 1.5, vy + 0.6, mcZ - 1.5], [mcX + 1.5, vy + 0.6, mcZ - 1.5],
                          [mcX + 1.5, vy + 0.6, mcZ + 1.5], [mcX - 1.5, vy + 0.6, mcZ + 1.5], [0, 1, 0], col3(0x1ad0e8));
            this.fcyl(mcX, vy + 5.5, mcZ, 0.42, 0.32, 11.0, 8, col3(0x8a7e6e));
            this.fbox(mcX, vy + 11.5, mcZ, 5.5, 1.4, 5.5, col3(0x2e6e28));
            this._collide(mcX, vy + 0.45, mcZ, 8.4, 1.0, 8.4, 'prop');

            // Royal Palm Trees around driveway and property
            const villaPalms = [
                { x: vX - 25, z: vZ + 42 }, { x: vX + 25, z: vZ + 42 },
                { x: vX - 45, z: vZ + 20 }, { x: vX + 45, z: vZ + 20 },
                { x: vX - 52, z: vZ - 15 }, { x: vX + 52, z: vZ - 15 },
                { x: vX - 35, z: vZ - 45 }, { x: vX + 35, z: vZ - 45 },
            ];
            for (const p of villaPalms) {
                this.fcyl(p.x, vy + 5.0, p.z, 0.40, 0.30, 10.0, 8, col3(0x8a7e6e));
                this.fbox(p.x, vy + 10.5, p.z, 5.2, 1.4, 5.2, col3(0x2e6e28));
                this._collide(p.x, vy + 2.5, p.z, 0.9, 5.0, 0.9, 'tree');
            }

            // =====================================================================
            // 2. BIG 4-CAR LUXURY GARAGE (VEHICLE SAVE & REPAIR WORKSHOP)
            // =====================================================================
            // West wing: x in [-792, -772], z in [1386, 1424], w = 20m, d = 38m, h = 4.8m
            const gX0 = vX - 47, gX1 = vX - 27, gZ0 = vZ - 19, gZ1 = vZ + 19;
            const gH = 4.8;
            const gCX = (gX0 + gX1) / 2, gCZ = (gZ0 + gZ1) / 2;

            // High-Gloss Dark Epoxy Floor with Yellow Parking Bays
            this.fquadN([gX0, vy + 0.05, gZ0], [gX1, vy + 0.05, gZ0], [gX1, vy + 0.05, gZ1], [gX0, vy + 0.05, gZ1], [0, 1, 0], col3(0x26292e));
            // 4 Yellow Parking Bay Markings
            for (let i = 0; i < 4; i++) {
                const bz = gZ0 + 5 + i * 8.5;
                this._beam(gX0 + 1.5, vy + 0.07, bz, gX1 - 1.5, vy + 0.07, bz, 0.18, 0.02, yellowStripe);
            }

            // Garage Walls: North, West, South
            this._beam(gX0, vy + gH / 2, gZ0, gX1, vy + gH / 2, gZ0, 0.5, gH, stuccoW);
            this._beam(gX0, vy + gH / 2, gZ0, gX0, vy + gH / 2, gZ1, 0.5, gH, stuccoW);
            this._beam(gX0, vy + gH / 2, gZ1, gX1, vy + gH / 2, gZ1, 0.5, gH, stuccoW);
            this._collide((gX0 + gX1) / 2, vy + gH / 2, gZ0, gX1 - gX0, gH, 0.5, 'building');
            this._collide(gX0, vy + gH / 2, (gZ0 + gZ1) / 2, 0.5, gH, gZ1 - gZ0, 'building');
            this._collide((gX0 + gX1) / 2, vy + gH / 2, gZ1, gX1 - gX0, gH, 0.5, 'building');

            // Garage East Wall (facing motor court): Twin wide modern roll-up glass garage doors
            this._beam(gX1, vy + gH / 2, gZ0, gX1, vy + gH / 2, gZ0 + 3, 0.5, gH, stuccoW);
            this._beam(gX1, vy + gH / 2, gCZ - 1.5, gX1, vy + gH / 2, gCZ + 1.5, 0.5, gH, stuccoW);
            this._beam(gX1, vy + gH / 2, gZ1 - 3, gX1, vy + gH / 2, gZ1, 0.5, gH, stuccoW);
            // Header lintel over garage openings
            this._beam(gX1, vy + gH - 0.4, gZ0, gX1, vy + gH - 0.4, gZ1, 0.6, 0.8, fasciaGrey);
            // Glass rollup door panels (raised/open for vehicle access!)
            this.fbox(gX1, vy + gH - 0.8, (gZ0 + 3 + gCZ - 1.5) / 2, 0.2, 0.8, 12, glassCyan);
            this.fbox(gX1, vy + gH - 0.8, (gCZ + 1.5 + gZ1 - 3) / 2, 0.2, 0.8, 12, glassCyan);

            // Flat Roof Slab over Garage
            this.fbox(gCX, vy + gH + 0.2, gCZ, gX1 - gX0 + 1.2, 0.4, gZ1 - gZ0 + 1.2, fasciaGrey);

            // Garage Detailing Station & Workshop:
            // Heavy-duty steel workbench along west wall
            this.fbox(gX0 + 1.2, vy + 0.9, gCZ, 1.4, 0.9, 10.0, col3(0x3a3d44));
            this._collide(gX0 + 1.2, vy + 0.9, gCZ, 1.4, 0.9, 10.0, 'prop');
            // Red Snap-on tool chests
            this.fbox(gX0 + 1.1, vy + 1.2, gCZ - 7.0, 1.2, 2.4, 2.2, redTool);
            this.fbox(gX0 + 1.1, vy + 1.2, gCZ + 7.0, 1.2, 2.4, 2.2, redTool);
            this._collide(gX0 + 1.1, vy + 1.2, gCZ - 7.0, 1.2, 2.4, 2.2, 'prop');
            this._collide(gX0 + 1.1, vy + 1.2, gCZ + 7.0, 1.2, 2.4, 2.2, 'prop');
            // Wall-mounted tire storage racks with gold BBS alloy wheels
            for (let bz = gZ0 + 6; bz <= gZ1 - 6; bz += 8) {
                this.fbox(gX0 + 0.8, vy + 3.2, bz, 0.8, 0.1, 3.2, chromeSilver);
                for (let tx = 0; tx < 3; tx++) {
                    this.fcyl(gX0 + 0.8, vy + 3.6, bz - 1.0 + tx * 1.0, 0.35, 0.35, 0.25, 12, col3(0x1a1a1a));
                    this.fcyl(gX0 + 0.8, vy + 3.6, bz - 1.0 + tx * 1.0, 0.22, 0.22, 0.26, 8, col3(0xd4af37));
                }
            }
            // Overhead LED strip light fixtures (bright neutral white 5000K)
            for (let bz = gZ0 + 4; bz <= gZ1 - 4; bz += 6.5) {
                this.fbox(gCX, vy + gH - 0.1, bz, 14.0, 0.1, 0.4, stuccoW);
                this.neonQuad([gCX - 6.5, vy + gH - 0.16, bz - 0.18], [gCX + 6.5, vy + gH - 0.16, bz - 0.18],
                              [gCX + 6.5, vy + gH - 0.16, bz + 0.18], [gCX - 6.5, vy + gH - 0.16, bz + 0.18], [0, -1, 0], col3(0xf4f8ff));
            }

            // Register Garage as an interactive safe-parking / auto-save lot!
            this.map.parkingLots = this.map.parkingLots || [];
            this.map.parkingLots.push({
                id: 'villa_garage',
                name: 'VIP Villa Garage',
                x0: gX0, x1: gX1, z0: gZ0, z1: gZ1,
                x1: gX0, x2: gX1, z1: gZ0, z2: gZ1,
                entX: gX1, mouthZ: gCZ,
                bays: [
                    { x: gCX, z: gZ0 + 8.5 },
                    { x: gCX, z: gZ0 + 17.0 },
                    { x: gCX, z: gZ0 + 25.5 },
                    { x: gCX, z: gZ0 + 34.0 },
                ],
                stalls: [
                    { x: gCX, z: gZ0 + 8.5 },
                    { x: gCX, z: gZ0 + 17.0 },
                    { x: gCX, z: gZ0 + 25.5 },
                    { x: gCX, z: gZ0 + 34.0 },
                ]
            });

            // =====================================================================
            // 3. CANTILEVERED INFINITY POOL & ENTERTAINMENT TERRACE
            // =====================================================================
            // Terrace extends along South cliff edge: x in [-768, -722], z in [1424, 1450]
            const pX0 = vX - 23, pX1 = vX + 23, pZ0 = vZ + 19, pZ1 = vZ + 45;
            // Travertine paved deck
            this.fquadN([pX0, vy + 0.05, pZ0], [pX1, vy + 0.05, pZ0], [pX1, vy + 0.05, pZ1], [pX0, vy + 0.05, pZ1], [0, 1, 0], travStone);

            // 22-meter Infinity Lap Pool: x in [vX - 19, vX + 9], z in [vZ + 25, vZ + 39]
            const poolX0 = vX - 19, poolX1 = vX + 9, poolZ0 = vZ + 25, poolZ1 = vZ + 39;
            // Pool basin floor at vy - 1.8m
            this.fquadN([poolX0, vy - 1.8, poolZ0], [poolX1, vy - 1.8, poolZ0],
                        [poolX1, vy - 1.8, poolZ1], [poolX0, vy - 1.8, poolZ1], [0, 1, 0], col3(0x127b92));
            // Pool turquoise water surface at vy - 0.15m
            this.fquadN([poolX0, vy - 0.15, poolZ0], [poolX1, vy - 0.15, poolZ0],
                        [poolX1, vy - 0.15, poolZ1], [poolX0, vy - 0.15, poolZ1], [0, 1, 0], poolTurquoise);
            // Submerged pool LED lighting (glowing cyan)
            this.neonQuad([poolX0 + 2, vy - 1.6, poolZ0 + 2], [poolX1 - 2, vy - 1.6, poolZ0 + 2],
                          [poolX1 - 2, vy - 1.6, poolZ1 - 2], [poolX0 + 2, vy - 1.6, poolZ1 - 2], [0, 1, 0], col3(0x20e0ff));
            // Vanishing south edge weir where water cascades over cliff
            this.fquadN([poolX0, vy - 0.15, poolZ1], [poolX1, vy - 0.15, poolZ1],
                        [poolX1, vy - 3.5, poolZ1], [poolX0, vy - 3.5, poolZ1], [0, 0, 1], col3(0x19a0b8));

            // Teak Wood Pool Loungers & White Parasols
            for (let x = poolX0 + 2; x <= poolX1 - 2; x += 4.5) {
                // Lounger
                this.fbox(x, vy + 0.35, poolZ0 - 2.5, 1.8, 0.3, 3.2, teakWood);
                this.fbox(x, vy + 0.52, poolZ0 - 2.5, 1.6, 0.15, 3.0, stuccoW); // white cushion
                // Parasol
                this.fcyl(x, vy + 1.8, poolZ0 - 4.5, 0.08, 0.08, 3.5, 6, chromeSilver);
                this.fbox(x, vy + 3.2, poolZ0 - 4.5, 3.2, 0.4, 3.2, stuccoW);
            }

            // Sunken Outdoor Fire Pit Lounge (East Terrace: x in [vX + 11, vX + 22], z in [vZ + 26, vZ + 37])
            const fpX = vX + 16.5, fpZ = vZ + 31.5;
            // Sunken pit floor (0.6m lower)
            this.fquadN([fpX - 5, vy - 0.6, fpZ - 5], [fpX + 5, vy - 0.6, fpZ - 5],
                       [fpX + 5, vy - 0.6, fpZ + 5], [fpX - 5, vy - 0.6, fpZ + 5], [0, 1, 0], travStone);
            // U-shaped luxury sectional sofa in sunken lounge
            this.fbox(fpX - 4.2, vy - 0.15, fpZ, 1.2, 0.6, 9.0, leatherGrey);
            this.fbox(fpX, vy - 0.15, fpZ - 4.2, 7.5, 0.6, 1.2, leatherGrey);
            this.fbox(fpX, vy - 0.15, fpZ + 4.2, 7.5, 0.6, 1.2, leatherGrey);
            // Central Linear Natural Gas Fire Pit Table with Glowing Embers
            this.fbox(fpX, vy - 0.2, fpZ, 3.2, 0.5, 1.6, col3(0x282a2e));
            this.neonQuad([fpX - 1.4, vy + 0.06, fpZ - 0.5], [fpX + 1.4, vy + 0.06, fpZ - 0.5],
                          [fpX + 1.4, vy + 0.06, fpZ + 0.5], [fpX - 1.4, vy + 0.06, fpZ + 0.5], [0, 1, 0], fireOrange);
            this._collide(fpX, vy - 0.1, fpZ, 3.4, 0.7, 1.8, 'prop');

            // Outdoor BBQ Kitchen Island (prep counter, gas grill & barstools)
            const bbqX = vX + 18, bbqZ = vZ + 21;
            this.fbox(bbqX, vy + 0.5, bbqZ, 6.0, 1.0, 1.8, travStone);
            this.fbox(bbqX, vy + 1.05, bbqZ, 6.2, 0.1, 2.0, col3(0x2a2c30)); // granite counter
            this.fbox(bbqX - 1.2, vy + 1.35, bbqZ, 1.8, 0.5, 1.2, chromeSilver); // stainless gas grill with hood
            this._collide(bbqX, vy + 0.6, bbqZ, 6.2, 1.2, 2.0, 'prop');
            for (let dx = -2; dx <= 2; dx += 1.3) {
                this.fcyl(bbqX + dx, vy + 0.4, bbqZ + 1.6, 0.06, 0.06, 0.8, 6, chromeSilver);
                this.fcyl(bbqX + dx, vy + 0.82, bbqZ + 1.6, 0.28, 0.28, 0.1, 8, teakWood);
            }

            // Frameless Structural Glass Railings along Cliff Terrace Edges
            this._beam(pX0, vy + 0.6, pZ1, pX1, vy + 0.6, pZ1, 0.1, 1.1, glassClear);
            this._beam(pX1, vy + 0.6, pZ0, pX1, vy + 0.6, pZ1, 0.1, 1.1, glassClear);
            this._beam(pX0, vy + 1.15, pZ1, pX1, vy + 1.15, pZ1, 0.15, 0.08, chromeSilver);
            this._beam(pX1, vy + 1.15, pZ0, pX1, vy + 1.15, pZ1, 0.15, 0.08, chromeSilver);
            this._collide((pX0 + pX1) / 2, vy + 0.6, pZ1, pX1 - pX0, 1.2, 0.4, 'barrier');
            this._collide(pX1, vy + 0.6, (pZ0 + pZ1) / 2, 0.4, 1.2, pZ1 - pZ0, 'barrier');

            // =====================================================================
            // 4. MAIN MODERN VILLA ARCHITECTURE ($44m x 24m)
            // =====================================================================
            // Spans x in [vX - 22, vX + 22], z in [vZ - 20, vZ + 16]
            const vx0 = vX - 22, vx1 = vX + 22, vz0 = vZ - 20, vz1 = vZ + 16;
            const hL1 = 4.8, hL2 = 4.0;
            const yL1 = vy, yL2 = vy + hL1, yRoof = yL2 + hL2;

            // Ground Floor Slab (raised to 0.08 to eliminate Z-fighting with terrain lawn)
            this.fquadN([vx0, yL1 + 0.08, vz0], [vx1, yL1 + 0.08, vz0],
                        [vx1, yL1 + 0.08, vz1], [vx0, yL1 + 0.08, vz1], [0, 1, 0], oakHardwood);
            // Mid-level Floor Slab (cantilevered overhang)
            this.fbox(vX, yL2, vZ - 2, (vx1 - vx0) + 2.5, 0.5, (vz1 - vz0) + 2.5, fasciaGrey);
            // White Finished Living Room Ceiling Underside
            this.fquadN([vx0, yL2 - 0.26, vz0], [vx1, yL2 - 0.26, vz0],
                        [vx1, yL2 - 0.26, vz1], [vx0, yL2 - 0.26, vz1], [0, -1, 0], stuccoW);
            // Recessed Warm Architectural Downlights in Living Room Ceiling
            for (let lx = -16; lx <= -6; lx += 5) {
                for (let lz = -12; lz <= 6; lz += 6) {
                    this.neonQuad([vX + lx - 0.35, yL2 - 0.28, vZ + lz - 0.35], [vX + lx + 0.35, yL2 - 0.28, vZ + lz - 0.35],
                                  [vX + lx + 0.35, yL2 - 0.28, vZ + lz + 0.35], [vX + lx - 0.35, yL2 - 0.28, vZ + lz + 0.35], [0, -1, 0], col3(0xffe6b5));
                }
            }
            // Upper Level Floor Slab Surface Finish (Dark Espresso Planks)
            this.fquadN([vx0, yL2 + 0.26, vz0], [vx1, yL2 + 0.26, vz0],
                        [vx1, yL2 + 0.26, vz1], [vx0, yL2 + 0.26, vz1], [0, 1, 0], col3(0x403d38));
            // Main Roof Cantilever Slab
            this.fbox(vX, yRoof, vZ - 2, (vx1 - vx0) + 4.0, 0.6, (vz1 - vz0) + 4.0, fasciaGrey);
            // White Finished Upper Level Ceiling Underside
            this.fquadN([vx0, yRoof - 0.31, vz0], [vx1, yRoof - 0.31, vz0],
                        [vx1, yRoof - 0.31, vz1], [vx0, yRoof - 0.31, vz1], [0, -1, 0], stuccoW);
            // Recessed Warm Architectural Downlights in Upper Level Ceiling
            for (let lx = 6; lx <= 16; lx += 5) {
                for (let lz = -12; lz <= 6; lz += 6) {
                    this.neonQuad([vX + lx - 0.35, yRoof - 0.33, vZ + lz - 0.35], [vX + lx + 0.35, yRoof - 0.33, vZ + lz - 0.35],
                                  [vX + lx + 0.35, yRoof - 0.33, vZ + lz + 0.35], [vX + lx - 0.35, yRoof - 0.33, vZ + lz + 0.35], [0, -1, 0], col3(0xffe6b5));
                }
            }

            // Exterior Solid Walls (Travertine & White Stucco accents)
            // North back wall
            this._beam(vx0, yL1 + hL1 / 2, vz0, vx1, yL1 + hL1 / 2, vz0, 0.5, hL1, travStone);
            this._collide((vx0 + vx1) / 2, yL1 + hL1 / 2, vz0, vx1 - vx0, hL1, 0.5, 'building');
            // West wall (adjacent to garage, with open archway connecting)
            this._beam(vx0, yL1 + hL1 / 2, vz0, vx0, yL1 + hL1 / 2, vz0 + 6, 0.5, hL1, stuccoW);
            this._beam(vx0, yL1 + hL1 / 2, vz1 - 6, vx0, yL1 + hL1 / 2, vz1, 0.5, hL1, stuccoW);
            this._collide(vx0, yL1 + hL1 / 2, vz0 + 3, 0.5, hL1, 6, 'building');
            this._collide(vx0, yL1 + hL1 / 2, vz1 - 3, 0.5, hL1, 6, 'building');
            // East wall
            this._beam(vx1, yL1 + hL1 / 2, vz0, vx1, yL1 + hL1 / 2, vz1, 0.5, hL1, travStone);
            this._collide(vx1, yL1 + hL1 / 2, (vz0 + vz1) / 2, 0.5, hL1, vz1 - vz0, 'building');

            // South Panoramic Glass Facade (Floor-to-ceiling glass looking over infinity pool & city)
            this.fbox(vX - 12, yL1 + hL1 / 2, vz1, 18, hL1, 0.2, glassCyan);
            this.fbox(vX + 12, yL1 + hL1 / 2, vz1, 18, hL1, 0.2, glassCyan);
            // Central Double-Door Open Walkway to Pool Deck (x in [vX - 3, vX + 3] is OPEN!)
            this._beam(vX - 3, yL1 + hL1 - 0.4, vz1, vX + 3, yL1 + hL1 - 0.4, vz1, 0.4, 0.8, steelBlack);
            this._collide(vX - 12, yL1 + hL1 / 2, vz1, 18, hL1, 0.4, 'building');
            this._collide(vX + 12, yL1 + hL1 / 2, vz1, 18, hL1, 0.4, 'building');

            // =====================================================================
            // 5. FULLY FURNISHED INTERIOR: LIVING ROOM (West Wing, Ground Floor)
            // =====================================================================
            const lrX = vX - 11, lrZ = vZ - 3;
            // Plush Ivory Wool Area Rug
            this.fquadN([lrX - 6.5, yL1 + 0.04, lrZ - 6.5], [lrX + 6.5, yL1 + 0.04, lrZ - 6.5],
                       [lrX + 6.5, yL1 + 0.04, lrZ + 6.5], [lrX - 6.5, yL1 + 0.04, lrZ + 6.5], [0, 1, 0], col3(0xd8d3c5));

            // Designer L-Shaped Sectional Couch (plush heather charcoal)
            this.fbox(lrX, yL1 + 0.45, lrZ - 4.5, 9.0, 0.7, 2.2, leatherGrey);
            this.fbox(lrX - 3.8, yL1 + 0.45, lrZ, 2.2, 0.7, 7.5, leatherGrey);
            // Backrests and throw pillows
            this.fbox(lrX, yL1 + 0.95, lrZ - 5.3, 9.0, 0.6, 0.6, leatherGrey);
            this.fbox(lrX - 4.6, yL1 + 0.95, lrZ, 0.6, 0.6, 7.5, leatherGrey);
            this.fbox(lrX + 2.5, yL1 + 0.85, lrZ - 4.6, 0.8, 0.5, 0.8, col3(0xd4af37)); // gold accent pillow
            this._collide(lrX, yL1 + 0.6, lrZ - 4.5, 9.0, 1.0, 2.2, 'prop');
            this._collide(lrX - 3.8, yL1 + 0.6, lrZ, 2.2, 1.0, 7.5, 'prop');

            // Black Marquina Marble & Brass Coffee Table
            this.fbox(lrX + 0.8, yL1 + 0.35, lrZ, 4.5, 0.45, 2.2, col3(0x222428));
            this.fcyl(lrX - 0.8, yL1 + 0.6, lrZ, 0.25, 0.2, 0.15, 8, col3(0xede8dc)); // ceramic decor bowl
            this._collide(lrX + 0.8, yL1 + 0.35, lrZ, 4.5, 0.6, 2.2, 'prop');

            // Feature Wall: Dark Vertical Wood Slats with Integrated Linear Fireplace & 85" OLED TV
            const fwX = lrX, fwZ = vz0 + 0.4;
            this.fbox(fwX, yL1 + 2.4, fwZ, 12.0, 4.6, 0.4, col3(0x282420));
            // 85-inch Wall-Mounted OLED TV with Soundbar
            this.fbox(fwX, yL1 + 3.2, fwZ + 0.25, 4.2, 2.4, 0.1, col3(0x101214)); // TV frame
            this.neonQuad([fwX - 2.0, yL1 + 2.1, fwZ + 0.32], [fwX + 2.0, yL1 + 2.1, fwZ + 0.32],
                          [fwX + 2.0, yL1 + 4.3, fwZ + 0.32], [fwX - 2.0, yL1 + 4.3, fwZ + 0.32], [0, 0, 1], col3(0x1a88b0)); // glowing screen
            this.fbox(fwX, yL1 + 1.85, fwZ + 0.25, 3.8, 0.2, 0.2, col3(0x181a1c)); // soundbar
            // Modern Linear Fireplace with Glowing Orange Embers
            this.fbox(fwX, yL1 + 0.8, fwZ + 0.2, 3.8, 0.8, 0.3, steelBlack);
            this.neonQuad([fwX - 1.6, yL1 + 0.6, fwZ + 0.36], [fwX + 1.6, yL1 + 0.6, fwZ + 0.36],
                          [fwX + 1.6, yL1 + 0.95, fwZ + 0.36], [fwX - 1.6, yL1 + 0.95, fwZ + 0.36], [0, 0, 1], fireOrange);

            // Indoor Potted Plants (Fiddle-Leaf Fig in white ceramic pot)
            this.fcyl(lrX + 6.5, yL1 + 0.45, vz0 + 1.5, 0.4, 0.35, 0.9, 8, stuccoW);
            this.fbox(lrX + 6.5, yL1 + 1.8, vz0 + 1.5, 1.4, 1.8, 1.4, col3(0x2d6828));

            // =====================================================================
            // 6. GOURMET CHEF'S KITCHEN & DINING ROOM (East Wing, Ground Floor)
            // =====================================================================
            const kitX = vX + 11, kitZ = vZ - 3;
            // Calacatta Quartz Waterfall Island
            this.fbox(kitX, yL1 + 0.55, kitZ, 5.5, 1.1, 2.2, marbleWhite);
            this._collide(kitX, yL1 + 0.55, kitZ, 5.5, 1.1, 2.2, 'prop');
            // Suspended Stainless Island Range Hood
            this.fbox(kitX, yL1 + 3.8, kitZ, 2.4, 1.2, 1.2, chromeSilver);
            // 4 Modern Leather Barstools
            for (let dx = -1.8; dx <= 1.8; dx += 1.2) {
                this.fcyl(kitX + dx, yL1 + 0.4, kitZ + 1.8, 0.05, 0.05, 0.8, 6, steelBlack);
                this.fcyl(kitX + dx, yL1 + 0.82, kitZ + 1.8, 0.3, 0.3, 0.12, 8, leatherGrey);
            }

            // Matte Black Back Kitchen Cabinets & Built-in Appliances along North Wall
            this.fbox(kitX, yL1 + 1.5, vz0 + 0.8, 9.0, 3.0, 1.4, col3(0x222428));
            // Stainless Double-Door French Refrigerator
            this.fbox(kitX + 3.5, yL1 + 1.6, vz0 + 0.9, 1.8, 3.2, 1.4, chromeSilver);
            // Double Wall Ovens
            this.fbox(kitX + 1.8, yL1 + 1.5, vz0 + 0.9, 1.2, 1.8, 1.4, col3(0x3a3d42));
            this._collide(kitX, yL1 + 1.5, vz0 + 0.8, 9.0, 3.0, 1.4, 'building');

            // Backlit Glass Wine Cellar Display Cabinet along East Wall
            this.fbox(vx1 - 0.4, yL1 + 2.0, kitZ, 0.6, 3.8, 6.0, glassCyan);
            this.neonQuad([vx1 - 0.72, yL1 + 0.6, kitZ - 2.8], [vx1 - 0.72, yL1 + 0.6, kitZ + 2.8],
                          [vx1 - 0.72, yL1 + 3.6, kitZ + 2.8], [vx1 - 0.72, yL1 + 3.6, kitZ - 2.8], [-1, 0, 0], col3(0xffdf94));

            // Solid Walnut 8-Seater Dining Table
            const dtX = kitX, dtZ = vZ + 9;
            this.fbox(dtX, yL1 + 0.45, dtZ, 5.2, 0.12, 2.4, oakHardwood);
            this.fcyl(dtX - 2.0, yL1 + 0.22, dtZ, 0.15, 0.15, 0.44, 6, steelBlack);
            this.fcyl(dtX + 2.0, yL1 + 0.22, dtZ, 0.15, 0.15, 0.44, 6, steelBlack);
            this._collide(dtX, yL1 + 0.45, dtZ, 5.4, 0.9, 2.6, 'prop');
            // Modern Dining Chairs
            for (let dx = -1.8; dx <= 1.8; dx += 1.2) {
                this.fbox(dtX + dx, yL1 + 0.45, dtZ - 1.7, 0.55, 0.75, 0.55, leatherGrey);
                this.fbox(dtX + dx, yL1 + 0.45, dtZ + 1.7, 0.55, 0.75, 0.55, leatherGrey);
            }

            // =====================================================================
            // 7. FLOATING CANTILEVERED STAIRCASE TO UPPER FLOOR
            // =====================================================================
            const stX = vX, stZ = vZ - 10;
            for (let step = 0; step < 16; step++) {
                const sy = yL1 + (step / 16) * hL1;
                const sz = stZ + step * 0.7;
                this.fbox(stX, sy, sz, 2.2, 0.12, 0.55, oakHardwood);
                // Glass stair balustrade
                this.fbox(stX - 1.1, sy + 0.5, sz, 0.05, 0.9, 0.55, glassClear);
                this.fbox(stX + 1.1, sy + 0.5, sz, 0.05, 0.9, 0.55, glassClear);
            }

            // =====================================================================
            // 8. VIP MASTER SUITE & BALCONY (Upper Level: East Wing)
            // =====================================================================
            const msX = vX + 11, msZ = vZ - 3;
            // Master King-Size Modern Platform Bed
            this.fbox(msX, yL2 + 0.35, msZ - 5, 3.8, 0.55, 4.2, navyBed);
            this.fbox(msX, yL2 + 0.55, msZ - 4.8, 3.5, 0.25, 3.8, stuccoW); // crisp white duvet
            this.fbox(msX, yL2 + 1.2, msZ - 7.1, 4.4, 1.4, 0.4, leatherGrey); // upholstered headboard
            this._collide(msX, yL2 + 0.5, msZ - 5, 4.0, 1.2, 4.4, 'prop');

            // Floating Walnut Nightstands with Bedside Glowing Lamps
            for (const nx of [msX - 2.6, msX + 2.6]) {
                this.fbox(nx, yL2 + 0.45, msZ - 6.5, 1.2, 0.4, 1.0, teakWood);
                this.fcyl(nx, yL2 + 0.85, msZ - 6.5, 0.15, 0.22, 0.4, 6, col3(0xffe6b0)); // glowing lamp shade
                this.neonQuad([nx - 0.2, yL2 + 0.7, msZ - 6.3], [nx + 0.2, yL2 + 0.7, msZ - 6.3],
                              [nx + 0.2, yL2 + 1.0, msZ - 6.3], [nx - 0.2, yL2 + 1.0, msZ - 6.3], [0, 0, 1], col3(0xfff0d0));
            }

            // Private Master Sunrise Balcony (overlooking East toward Manhattan!)
            this.fbox(vx1 + 2.5, yL2, msZ, 5.0, 0.4, 14.0, fasciaGrey);
            this._beam(vx1 + 5.0, yL2 + 0.6, msZ - 7, vx1 + 5.0, yL2 + 0.6, msZ + 7, 0.1, 1.1, glassClear);
            this._beam(vx1, yL2 + 0.6, msZ - 7, vx1 + 5.0, yL2 + 0.6, msZ - 7, 0.1, 1.1, glassClear);
            this._beam(vx1, yL2 + 0.6, msZ + 7, vx1 + 5.0, yL2 + 0.6, msZ + 7, 0.1, 1.1, glassClear);
            this._collide(vx1 + 5.0, yL2 + 0.6, msZ, 0.4, 1.2, 14.0, 'barrier');

            // =====================================================================
            // 9. SPA MASTER BATHROOM & SOAKING TUB (Upper Level: North Wing)
            // =====================================================================
            const bathX = vX + 12, bathZ = vz0 + 5;
            // Freestanding Oval Soaking Tub overlooking panoramic glass
            this.fcyl(bathX, yL2 + 0.5, bathZ, 1.4, 1.6, 0.9, 14, stuccoW);
            this.fcyl(bathX, yL2 + 0.7, bathZ, 1.2, 1.2, 0.1, 14, fountainWater);
            this._collide(bathX, yL2 + 0.5, bathZ, 2.8, 1.0, 2.8, 'prop');
            // Floating Double Vanity with Vessel Sinks & Backlit Mirrors
            this.fbox(bathX - 5.5, yL2 + 0.5, bathZ, 1.4, 0.7, 4.0, travStone);
            this.neonQuad([bathX - 4.78, yL2 + 1.2, bathZ - 1.5], [bathX - 4.78, yL2 + 1.2, bathZ + 1.5],
                          [bathX - 4.78, yL2 + 2.6, bathZ + 1.5], [bathX - 4.78, yL2 + 2.6, bathZ - 1.5], [1, 0, 0], col3(0xffffff));

            // =====================================================================
            // 10. EXECUTIVE HOME OFFICE / STUDY (Upper Level: West Wing)
            // =====================================================================
            const ofX = vX - 11, ofZ = vZ - 3;
            // Solid Mahogany Executive Desk
            this.fbox(ofX, yL2 + 0.45, ofZ, 4.2, 0.1, 2.2, col3(0x4a2c1a));
            this.fbox(ofX - 1.8, yL2 + 0.22, ofZ, 0.1, 0.44, 2.0, steelBlack);
            this.fbox(ofX + 1.8, yL2 + 0.22, ofZ, 0.1, 0.44, 2.0, steelBlack);
            this._collide(ofX, yL2 + 0.45, ofZ, 4.4, 0.9, 2.4, 'prop');
            // Ultrawide Curved Computer Monitor & Ergonomic Chair
            this.fbox(ofX, yL2 + 0.9, ofZ - 0.5, 2.4, 0.6, 0.15, col3(0x181a1c));
            this.neonQuad([ofX - 1.1, yL2 + 0.65, ofZ - 0.4], [ofX + 1.1, yL2 + 0.65, ofZ - 0.4],
                          [ofX + 1.1, yL2 + 1.15, ofZ - 0.4], [ofX - 1.1, yL2 + 1.15, ofZ - 0.4], [0, 0, 1], col3(0x289cd0));
            this.fbox(ofX, yL2 + 0.6, ofZ + 1.2, 0.9, 1.2, 0.9, leatherGrey); // ergonomic chair

            // Built-in Bookshelf Wall with Books & Awards
            this.fbox(ofX, yL2 + 2.0, vz0 + 0.8, 8.0, 3.6, 0.8, oakHardwood);
            for (let by = yL2 + 0.8; by <= yL2 + 3.2; by += 0.8) {
                this.fbox(ofX, by, vz0 + 1.0, 7.6, 0.08, 0.6, travStone);
            }
        }

        // ---- props (placement + instanced meshes) ----------------------------------
        _placeStreetProps() {
            const rng = mulberry32(5150);
            // Trees were laid over whole blocks during fillBlock, so many sat
            // inside building facades. Every building/house footprint is now
            // registered, so nudge each tree out to the nearest face.
            this.propSpots.trees = this.propSpots.trees.filter((t) => !this._insidePropExclusion(t.x, t.z, 0.8));
            for (const t of this.propSpots.trees) this._clearOfBuildings(t, 0.6);
            // Street lamps along every road, alternating sides.
            for (const seg of this.map.segments) {
                if (seg.bridge) continue;
                const len = seg.dir === 'ns' ? (seg.bz - seg.az) : (seg.bx - seg.ax);
                if (len < 30 || seg.dir === 'diag') continue;
                const isNS = seg.dir === 'ns';
                let k = 0;
                for (let t = 20; t < len - 15; t += 55, k++) {
                    const side = k % 2 === 0 ? 1 : -1;
                    const off = seg.width / 2 + 1.3;
                    const lx = isNS ? seg.ax + side * off : seg.ax + t;
                    const lz = isNS ? seg.az + t : seg.az + side * off;
                    if (!LandMask.inside(lx, lz)) continue;
                    this.propSpots.lamps.push({
                        x: lx, z: lz,
                        // Lamp arm extends toward local -Z: east-side NS lamps face
                        // west (-X), west-side face east (+X); south-side EW lamps
                        // face north (-Z), north-side face south (+Z).
                        ry: isNS ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
                    });
                }
            }
            // Hydrants along street sidewalks near intersections + bins mid-block.
            for (let i = 0; i < this.map.segments.length; i++) {
                const seg = this.map.segments[i];
                if (rng() < 0.45) {
                    const isNS = seg.dir === 'ns';
                    const side = rng() < 0.5 ? 1 : -1;
                    const off = seg.width / 2 + 1.25;
                    const len = isNS ? seg.bz - seg.az : seg.bx - seg.ax;
                    const t = rng() < 0.5 ? 12 : Math.max(12, len - 12);
                    const hx = isNS ? seg.ax + side * off : seg.ax + t;
                    const hz = isNS ? seg.az + t : seg.az + side * off;
                    if (LandMask.inside(hx, hz)) {
                        this.propSpots.hydrants.push({
                            x: hx, y: 0.22, z: hz,
                            ry: isNS ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0),
                        });
                    }
                }
            }
            for (const b of this.map.blocks) {
                if (b.grammar === 'park') {
                    if (rng() < 0.35) {
                        const vx = (b.x1 + b.x2) / 2 + (rng() - 0.5) * (b.x2 - b.x1) * 0.4;
                        const vz = (b.z1 + b.z2) / 2 + (rng() - 0.5) * (b.z2 - b.z1) * 0.4;
                        this.propSpots.vendorCarts.push({ x: vx, y: 0.12, z: vz, ry: rng() * TAU });
                        this.colliders.push({ x: vx, y: 0.9, z: vz, sx: 1.4, sy: 1.8, sz: 1.8 });
                    }
                    continue;
                }
                if (rng() < 0.35) {
                    const bs = { x: (b.x1 + b.x2) / 2 + (rng() - 0.5) * 10, y: 0.22, z: b.z1 + 3.2, ry: rng() * TAU };
                    this._clearOfBuildings(bs, 0.5);
                    this.propSpots.bins.push(bs);
                }
                if (rng() < 0.25) {
                    const ax = b.x1 + 3.2;
                    const az = (b.z1 + b.z2) / 2 + (rng() - 0.5) * 8;
                    const as = { x: ax, y: 0.22, z: az, ry: Math.PI / 2 };
                    this._clearOfBuildings(as, 0.6);
                    this.propSpots.atms.push(as);
                    this.colliders.push({ x: as.x, y: 0.8, z: as.z, sx: 0.8, sy: 1.6, sz: 0.7 });
                }
                if (rng() < 0.16) {
                    const cs = { x: b.x2 - 3.2, y: 0.22, z: b.z2 - 3.2, ry: rng() * TAU, type: 'cart', name: 'Street Food Cart' };
                    this._clearOfBuildings(cs, 1.2);
                    this.propSpots.vendorCarts.push(cs);
                    this.colliders.push({ x: cs.x, y: 0.9, z: cs.z, sx: 1.4, sy: 1.8, sz: 1.8 });
                }
                if (rng() < 0.26) {
                    const mx = { x: b.x1 + 4.5, y: 0.22, z: b.z1 + 3.2, ry: 0 };
                    this._clearOfBuildings(mx, 0.5);
                    this.propSpots.mailboxes.push(mx);
                    this.colliders.push({ x: mx.x, y: 0.7, z: mx.z, sx: 0.6, sy: 1.2, sz: 0.6 });
                }
            }
            const subwaySpots = [
                { id: 'midtown', name: 'Times Square & 42nd St', x: 450, z: 1870, ry: 0, line: 'Line 1 · Broadway Express', lineCode: '1', color: '#ee352e' },
                { id: 'herald', name: 'Herald Sq & 34th St', x: 530, z: 1940, ry: Math.PI, line: 'Line 1 · Broadway Local', lineCode: '1', color: '#ee352e' },
                { id: 'canal', name: 'Canal St & Chinatown', x: 400, z: 3200, ry: Math.PI / 2, line: 'Line 6 · Lexington Ave', lineCode: '6', color: '#00933c' },
                { id: 'centralpark', name: 'Central Park West', x: 360, z: 1450, ry: -Math.PI / 2, line: 'Line 1 · Uptown Express', lineCode: '1', color: '#ee352e' },
                { id: 'financial', name: 'Wall St & Financial District', x: 490, z: 2400, ry: 0, line: 'Line 4 · Downtown Fast', lineCode: '4', color: '#00933c' },
                { id: 'eastvillage', name: 'East Village & Union Sq', x: 580, z: 2700, ry: Math.PI / 2, line: 'Line 6 · East Side Local', lineCode: '6', color: '#00933c' },
                { id: 'brooklyn', name: 'Brooklyn Heights & Waterfront', x: 1240, z: 3150, ry: 0, line: 'Line 7 · Cross-River Transit', lineCode: '7', color: '#b933ad' },
            ];
            this.map.subwayStations = subwaySpots;
            for (const sp of subwaySpots) {
                this.propSpots.subwayEntrances.push({ x: sp.x, y: 0.22, z: sp.z, ry: sp.ry });
                const cos = Math.cos(sp.ry), sin = Math.sin(sp.ry);
                // Side railings and rear wall colliders only — front stairs entrance is open!
                this.colliders.push({ x: sp.x - cos * 1.15, y: 0.9, z: sp.z + sin * 1.15, sx: 0.35, sy: 1.5, sz: 3.2 });
                this.colliders.push({ x: sp.x + cos * 1.15, y: 0.9, z: sp.z + sin * 1.15, sx: 0.35, sy: 1.5, sz: 3.2 });
                this.colliders.push({ x: sp.x + sin * 1.65, y: 0.9, z: sp.z + cos * 1.65, sx: 2.3, sy: 1.5, sz: 0.35 });
            }
            for (const lot of (this.map.parkingLots || [])) {
                const cx = (lot.x1 + lot.x2) / 2;
                this.propSpots.trafficCones.push({ x: cx - 4.6, y: 0.10, z: lot.z2 - 0.4, ry: 0 });
                this.propSpots.trafficCones.push({ x: cx - 4.6, y: 0.10, z: lot.z2 - 1.2, ry: 0.2 });
                this.propSpots.trafficCones.push({ x: cx + 4.6, y: 0.10, z: lot.z2 - 0.4, ry: -0.1 });
                this.propSpots.trafficCones.push({ x: cx + 4.6, y: 0.10, z: lot.z2 - 1.2, ry: 0.3 });
                const pbar = { x: cx - 2.8, y: 0.10, z: lot.z2 - 0.8, ry: 0 };
                this.propSpots.parkingBarriers.push(pbar);
                this.colliders.push({ x: pbar.x, y: 0.5, z: pbar.z, sx: 0.6, sy: 1.0, sz: 0.6 });
            }
            // Solid-prop colliders: tree trunks, lamp posts, signal poles.
            // (Hydrants/bins stay walkover-able.) PhysicsWorld is built from
            // this.colliders after the async build, so late pushes are safe.
            const isRoadConflict = (px, pz, margin = 0.6) => {
                if (!this.map || !this.map.segments) return false;
                for (let s = 0; s < this.map.segments.length; s++) {
                    const seg = this.map.segments[s];
                    const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
                    const lenSq = dx * dx + dz * dz;
                    let t = lenSq === 0 ? 0 : ((px - seg.ax) * dx + (pz - seg.az) * dz) / lenSq;
                    t = Math.max(0, Math.min(1, t));
                    const nx = seg.ax + t * dx, nz = seg.az + t * dz;
                    const d = Math.hypot(px - nx, pz - nz);
                    if (d < seg.width / 2 + margin) return true;
                }
                return false;
            };

            // Traffic lights: NYC-style mast poles with overhang arms, signal housing backplates, and pedestrian walk boxes.
            for (const light of this.map.lights) {
                const x = light.x, z = light.z;
                const poleC = col3(0x2c2f35); // dark municipal traffic metal
                const boxC = col3(0x1a1a1d);  // dark signal head housing
                const borderC = col3(0xf2c20e); // high-contrast DOT yellow reflector border

                // Compute exact corner offsets using intersecting segment widths
                const wNS = (light.node && (light.node.ns || light.node.diag)) ? (light.node.ns || light.node.diag).width : 20;
                const wEW = (light.node && light.node.ew) ? light.node.ew.width : 16;
                const offX = wNS * 0.5 + 1.25;
                const offZ = wEW * 0.5 + 1.25;

                // Do not spawn traffic light poles onto active bridge decks/ramps
                const pAx = x + offX, pAz = z + offZ;
                const pBx = x - offX, pBz = z - offZ;
                if (typeof bridgeDeckY === 'function') {
                    if (bridgeDeckY(pAx, pAz) > 0 || bridgeDeckY(pBx, pBz) > 0) continue;
                }

                // --- Pole A (SE corner: controlling North-South Avenue Traffic) ---
                this.fcyl(pAx, 2.7, pAz, 0.13, 0.09, 5.4, 8, poleC);
                this.fcyl(pAx, 0.18, pAz, 0.28, 0.22, 0.36, 8, poleC); // base collar
                // Pedestrian walk box on pole for curb crossers
                this.fbox(pAx - 0.22, 2.3, pAz, 0.24, 0.44, 0.24, boxC);
                this.fbox(pAx - 0.35, 2.3, pAz, 0.04, 0.36, 0.18, col3(0xffffff)); // walk glyph lens
                // Overhead mast arm reaching west over the avenue lanes
                const armALen = wNS * 0.48 + 1.0;
                const headAx = pAx - armALen + 0.6;
                const headAy = 4.85;
                const headAz = pAz;
                this.fbox(pAx - armALen * 0.5, 5.30, pAz, armALen, 0.13, 0.13, poleC);
                // Signal head housing with yellow backplate
                this.fbox(headAx, headAy, headAz, 0.42, 1.28, 0.38, boxC);
                this.fbox(headAx, headAy, headAz - 0.19, 0.48, 1.34, 0.04, borderC); // yellow backplate border
                this.colliders.push({ x: pAx, y: 2.7, z: pAz, sx: 0.32, sy: 5.4, sz: 0.32 });

                // --- Pole B (NW corner: controlling East-West Street Traffic) ---
                this.fcyl(pBx, 2.7, pBz, 0.13, 0.09, 5.4, 8, poleC);
                this.fcyl(pBx, 0.18, pBz, 0.28, 0.22, 0.36, 8, poleC); // base collar
                // Pedestrian walk box on pole
                this.fbox(pBx, 2.3, pBz + 0.22, 0.24, 0.44, 0.24, boxC);
                this.fbox(pBx, 2.3, pBz + 0.35, 0.18, 0.36, 0.04, col3(0xffffff)); // walk glyph lens
                // Overhead mast arm reaching east/south over the cross street
                const armBLen = wEW * 0.48 + 1.0;
                const headBx = pBx;
                const headBy = 4.85;
                const headBz = pBz + armBLen - 0.6;
                this.fbox(pBx, 5.30, pBz + armBLen * 0.5, 0.13, 0.13, armBLen, poleC);
                // Signal head housing with yellow backplate
                this.fbox(headBx, headBy, headBz, 0.38, 1.28, 0.42, boxC);
                this.fbox(headBx - 0.19, headBy, headBz, 0.04, 1.34, 0.48, borderC); // yellow backplate border
                this.colliders.push({ x: pBx, y: 2.7, z: pBz, sx: 0.32, sy: 5.4, sz: 0.32 });

                // Lens trios (3 stacked per head):
                // Push NS lenses contiguously, then EW lenses contiguously
                const nsBase = this.propSpots.lens.length;
                for (let i = 0; i < 3; i++) {
                    this.propSpots.lens.push({
                        x: headAx,
                        y: headAy + 0.36 - i * 0.36,
                        z: headAz - 0.21,
                        axis: 'ns'
                    });
                }
                const ewBase = this.propSpots.lens.length;
                for (let i = 0; i < 3; i++) {
                    this.propSpots.lens.push({
                        x: headBx - 0.21,
                        y: headBy + 0.36 - i * 0.36,
                        z: headBz,
                        axis: 'ew'
                    });
                }
                this.lightAt.push({ x, z, nsBase, ewBase });
            }

            // Filter out any lamps that fell directly into road driving lanes BEFORE creating instances
            this.propSpots.lamps = this.propSpots.lamps.filter(l => !isRoadConflict(l.x, l.z, 0.4));
            for (const l of this.propSpots.lamps) {
                const ly = l.y !== undefined ? l.y : 0.22;
                this.colliders.push({ x: l.x, y: ly + 2.3, z: l.z, sx: 0.34, sy: 4.6, sz: 0.34 });
            }

            // Filter out any trees that fell directly into road driving lanes BEFORE creating instances
            this.propSpots.trees = this.propSpots.trees.filter(t => !isRoadConflict(t.x, t.z, 0.45));
            for (const t of this.propSpots.trees) {
                const s = t.s || 1;
                const trunkW = 0.5 * s;
                const trunkH = 2.7 * s;
                this.colliders.push({ x: t.x, y: 0.07 + trunkH / 2, z: t.z, sx: trunkW, sy: trunkH, sz: trunkW });
            }

            // Hydrants / bins / cones are solid too. Keep them out of the driving
            // lanes (they sit on the sidewalk/prop edge) so they don't block roads.
            this.propSpots.hydrants = this.propSpots.hydrants.filter(h => !isRoadConflict(h.x, h.z, 0.4));
            for (const h of this.propSpots.hydrants) {
                this.colliders.push({ x: h.x, y: h.y + 0.32, z: h.z, sx: 0.5, sy: 0.8, sz: 0.5 });
            }
            this.propSpots.bins = this.propSpots.bins.filter(bn => !isRoadConflict(bn.x, bn.z, 0.4));
            for (const bn of this.propSpots.bins) {
                this.colliders.push({ x: bn.x, y: bn.y + 0.34, z: bn.z, sx: 0.55, sy: 0.75, sz: 0.55 });
            }
            for (const cn of (this.propSpots.trafficCones || [])) {
                this.colliders.push({ x: cn.x, y: cn.y + 0.25, z: cn.z, sx: 0.4, sy: 0.5, sz: 0.4 });
            }
        }

        /** Prototype geometry for one prop kind (vertex-colored, unit scale). */
        static propGeometry(kind) {
            const b = new GeoBatch();
            switch (kind) {
                case 'tree0': // round canopy street tree
                    b.cylinderY(0, 0.8, 0, 0.13, 0.1, 1.6, 6, col3(0x6a4a2e));
                    b.cylinderY(0, 2.9, 0, 1.35, 2.0, 2.6, 8, col3(0x5a8a3c), { capped: 'top' });
                    b.disc(0, 4.2, 0, 1.85, 8, col3(0x64984a), true);
                    break;
                case 'tree1': // conifer
                    b.cylinderY(0, 0.6, 0, 0.12, 0.1, 1.2, 6, col3(0x5e4630));
                    b.cylinderY(0, 2.9, 0, 1.6, 0.06, 3.4, 8, col3(0x3f7038));
                    break;
                case 'lamp':
                    // Arm extends toward local -Z, matching lamp.glb (ry = 0 faces -Z).
                    b.cylinderY(0, 2.3, 0, 0.07, 0.06, 4.6, 6, col3(0x3a3d42));
                    b.box(0, 4.55, -0.55, 0.1, 0.1, 1.1, col3(0x3a3d42));
                    b.box(0, 4.42, -1.05, 0.28, 0.16, 0.5, col3(0xf0e6b8));
                    break;
                case 'hydrant':
                    // Vibrant safety fire-engine red barrel + dome, chrome silver nozzle caps, brass pentagonal nut
                    b.cylinderY(0, 0.32, 0, 0.18, 0.16, 0.64, 8, col3(0xd92518));
                    b.disc(0, 0.65, 0, 0.16, 8, col3(0xcc1f12), true);
                    b.cylinderY(0, 0.68, 0, 0.05, 0.05, 0.08, 5, col3(0xf2b705)); // brass operating nut
                    b.box(0, 0.38, 0, 0.54, 0.14, 0.14, col3(0xd8dbe2)); // side pumper nozzle outlets (chrome silver)
                    b.box(0, 0.28, 0.20, 0.16, 0.16, 0.16, col3(0xd8dbe2)); // front steamer nozzle cap (chrome silver)
                    break;
                case 'bin':
                    b.cylinderY(0, 0.35, 0, 0.27, 0.24, 0.7, 7, col3(0x3d5a3a));
                    b.disc(0, 0.72, 0, 0.27, 7, col3(0x2c422a), true);
                    break;
                case 'atm':
                    b.box(0, 0.7, 0, 0.7, 1.4, 0.6, col3(0x2d3a4a));
                    b.box(0, 0.95, -0.28, 0.45, 0.3, 0.05, col3(0x40b4f0));
                    break;
                case 'vendor_cart':
                    b.box(0, 0.55, 0, 1.2, 0.65, 1.8, col3(0x8899aa));
                    b.cylinderY(0, 1.8, 0, 1.1, 1.1, 0.35, 8, col3(0xdd3333));
                    break;
                case 'subway_entrance':
                    b.box(0, 0.5, 0, 2.4, 1.0, 3.2, col3(0x224422));
                    break;
                case 'traffic_cone':
                    b.box(0, 0.03, 0, 0.35, 0.05, 0.35, col3(0xee6611));
                    b.cylinderY(0, 0.35, 0, 0.04, 0.14, 0.7, 7, col3(0xee6611));
                    break;
                case 'water_tower':
                    b.cylinderY(0, 3.5, 0, 1.4, 1.4, 1.6, 10, col3(0x5a3e2a));
                    b.cylinderY(0, 1.4, 0, 0.1, 0.1, 2.8, 6, col3(0x222222));
                    break;
                case 'rooftop_ac_unit':
                    b.box(0, 1.0, 0, 3.0, 2.0, 2.0, col3(0x778899));
                    break;
                case 'fire_escape':
                    b.box(0, 1.5, 0, 2.0, 3.0, 1.0, col3(0x222222));
                    break;
                case 'parking_barrier':
                    b.box(0, 0.45, 0, 0.35, 0.9, 0.35, col3(0xffcc00));
                    b.box(1.5, 0.85, 0, 3.0, 0.12, 0.12, col3(0xffffff));
                    break;
                case 'mailbox_blue':
                    b.box(0, 0.55, 0, 0.55, 1.1, 0.5, col3(0x1a4b8c));
                    b.cylinderY(0, 1.15, 0, 0.25, 0.25, 0.5, 8, col3(0x1a4b8c));
                    break;
            }
            return b.buildGeometry();
        }

        _buildPropMeshes() {
            const dummy = new THREE.Object3D();
            const rng = mulberry32(626);
            this.propMeshes = this.propMeshes || []; // may hold GLB meshes (bull/statue) already
            const mk = (kind, spots, tinted, casts) => {
                if (!spots.length) return;
                const file = GLB_PROP_KINDS[kind];
                const glb = file && this.assets && this.assets.props[file];
                const geo = glb
                    ? glbMergedGeometry(glb.scene, { isHydrant: kind === 'hydrant' })
                    : CityBuilder.propGeometry(kind);
                const propMat = this.mat.flat.clone();
                const mesh = new THREE.InstancedMesh(geo, propMat, spots.length);
                // One writer per group, so the map editor can re-place a single
                // instance later with exactly the transform used at build time.
                const write = (i) => {
                    const sp = spots[i];
                    dummy.position.set(sp.x, sp.y !== undefined ? sp.y : 0.22, sp.z);
                    dummy.rotation.set(0, sp.ry || 0, 0);
                    const s = sp.gone ? 0 : (sp.s || 1);
                    dummy.scale.set(s, s, s);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                };
                mesh.userData.edit = { key: 'p:' + kind, spots, write, y0: 0.22 };
                for (let i = 0; i < spots.length; i++) {
                    write(i);
                    if (tinted) {
                        const t = 0.8 + rng() * 0.4;
                        mesh.setColorAt(i, new THREE.Color(t, t * (0.92 + rng() * 0.16), t * (0.85 + rng() * 0.3)));
                    } else {
                        mesh.setColorAt(i, new THREE.Color(1, 1, 1));
                    }
                }
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                mesh.castShadow = !!casts;
                this.root.add(mesh);
                this.propMeshes.push(mesh);
            };
            // Split trees by variant.
            const t0 = this.propSpots.trees.filter(t => t.v === 0);
            const t1 = this.propSpots.trees.filter(t => t.v === 1);
            mk('tree0', t0, true, true);
            mk('tree1', t1, true, true);
            mk('lamp', this.propSpots.lamps, false, false);
            // Dynamic Streetlight Glow Flares & Illuminated Ground Light Pools
            if (this.propSpots.lamps && this.propSpots.lamps.length) {
                let glowTex = (this.mat && this.mat.glow && this.mat.glow.map)
                    || (this.sharedMat && this.sharedMat.glow && this.sharedMat.glow.map);
                if (!glowTex) {
                    glowTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
                        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
                        g.addColorStop(0, 'rgba(255,255,255,0.95)');
                        g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
                        g.addColorStop(1, 'rgba(255,255,255,0)');
                        ctx.fillStyle = g;
                        ctx.fillRect(0, 0, w, h);
                    });
                }
                if (glowTex) {
                    const lampCount = this.propSpots.lamps.length;
                    // 1. Streetlight lower lens: precisely covers the whitish rectangle beneath the head of the lamp
                    // Bounding coordinates in lamp.glb: X: [-0.12, 0.12], Y: [3.963, 3.997], Z: [-1.273, -0.772]
                    const lensGeo = new THREE.BoxGeometry(0.246, 0.040, 0.505);
                    const lensMat = new THREE.MeshBasicMaterial({
                        color: 0xffea80,
                        transparent: true,
                        opacity: 0.96,
                        depthWrite: true
                    });
                    this.streetLampGlowMesh = new THREE.InstancedMesh(lensGeo, lensMat, lampCount);
                    this.streetLampGlowMesh.count = lampCount;
                    this.streetLampGlowMesh.frustumCulled = false;

                    // 2. Ground light pools underneath streetlights on sidewalk/street
                    const poolGeo = new THREE.PlaneGeometry(9.5, 9.5);
                    poolGeo.rotateX(-Math.PI / 2);
                    const poolMat = new THREE.MeshBasicMaterial({
                        map: glowTex,
                        color: 0xffd265,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    this.streetLampPoolMesh = new THREE.InstancedMesh(poolGeo, poolMat, lampCount);
                    this.streetLampPoolMesh.count = lampCount;
                    this.streetLampPoolMesh.frustumCulled = false;

                    // 3. Atmospheric bloom flare / corona halo at each lamp head
                    const planeA = new THREE.PlaneGeometry(2.4, 2.4);
                    const planeB = new THREE.PlaneGeometry(2.4, 2.4);
                    planeB.rotateY(Math.PI / 2);
                    const countA = planeA.attributes.position.count, countB = planeB.attributes.position.count;
                    const fPos = new Float32Array((countA + countB) * 3);
                    fPos.set(planeA.attributes.position.array, 0);
                    fPos.set(planeB.attributes.position.array, countA * 3);
                    const fUv = new Float32Array((countA + countB) * 2);
                    fUv.set(planeA.attributes.uv.array, 0);
                    fUv.set(planeB.attributes.uv.array, countA * 2);
                    const idxA = planeA.index.array, idxB = planeB.index.array;
                    const fIdx = new Uint16Array(idxA.length + idxB.length);
                    fIdx.set(idxA, 0);
                    for (let j = 0; j < idxB.length; j++) fIdx[idxA.length + j] = idxB[j] + countA;
                    const flareGeo = new THREE.BufferGeometry();
                    flareGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
                    flareGeo.setAttribute('uv', new THREE.BufferAttribute(fUv, 2));
                    flareGeo.setIndex(new THREE.BufferAttribute(fIdx, 1));
                    const flareMat = new THREE.MeshBasicMaterial({
                        map: glowTex,
                        color: 0xffe285,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });
                    this.streetLampFlareMesh = new THREE.InstancedMesh(flareGeo, flareMat, lampCount);
                    this.streetLampFlareMesh.count = lampCount;
                    this.streetLampFlareMesh.frustumCulled = false;

                    const dummyL = new THREE.Object3D();
                    for (let i = 0; i < lampCount; i++) {
                        const sp = this.propSpots.lamps[i];
                        const ry = sp.ry || 0;
                        const bx = sp.x - Math.sin(ry) * 1.0225;
                        const bz = sp.z - Math.cos(ry) * 1.0225;
                        const by = (sp.y !== undefined ? sp.y : 0.22) + 3.980;
                        const poolY = (sp.y !== undefined ? sp.y + 0.05 : 0.186);

                        dummyL.position.set(bx, by, bz);
                        dummyL.rotation.set(0, ry, 0);
                        dummyL.scale.set(1.0, 1.0, 1.0);
                        dummyL.updateMatrix();
                        this.streetLampGlowMesh.setMatrixAt(i, dummyL.matrix);

                        dummyL.position.set(bx, poolY, bz);
                        dummyL.rotation.set(0, 0, 0);
                        dummyL.scale.set(1.0, 1.0, 1.0);
                        dummyL.updateMatrix();
                        this.streetLampPoolMesh.setMatrixAt(i, dummyL.matrix);

                        dummyL.position.set(bx, by, bz);
                        dummyL.rotation.set(0, 0, 0);
                        dummyL.scale.set(1.0, 1.0, 1.0);
                        dummyL.updateMatrix();
                        this.streetLampFlareMesh.setMatrixAt(i, dummyL.matrix);
                    }
                    this.streetLampGlowMesh.instanceMatrix.needsUpdate = true;
                    this.streetLampPoolMesh.instanceMatrix.needsUpdate = true;
                    this.streetLampFlareMesh.instanceMatrix.needsUpdate = true;

                    // Initial visibility: hidden during daytime
                    this.streetLampGlowMesh.visible = false;
                    this.streetLampPoolMesh.visible = false;
                    this.streetLampFlareMesh.visible = false;

                    this.root.add(this.streetLampGlowMesh);
                    this.root.add(this.streetLampPoolMesh);
                    this.root.add(this.streetLampFlareMesh);
                }
            }
            mk('hydrant', this.propSpots.hydrants, false, false);
            mk('bin', this.propSpots.bins, false, false);
            mk('atm', this.propSpots.atms || [], false, true);
            mk('vendor_cart', this.propSpots.vendorCarts || [], false, true);
            mk('subway_entrance', this.propSpots.subwayEntrances || [], false, true);
            mk('traffic_cone', this.propSpots.trafficCones || [], false, false);
            mk('water_tower', this.propSpots.waterTowers || [], false, true);
            mk('rooftop_ac_unit', this.propSpots.rooftopAcUnits || [], false, true);
            mk('fire_escape', this.propSpots.fireEscapes || [], false, true);
            mk('parking_barrier', this.propSpots.parkingBarriers || [], false, true);
            mk('mailbox_blue', this.propSpots.mailboxes || [], false, true);

            // GLB suburban houses (Brooklyn residential blocks) — one
            // InstancedMesh per house model.
            const bldMat = this.mat.building || this.mat.flat;
            for (const key of Object.keys(this.houseSpots)) {
                const def = this.houseDefs[key];
                const spots = this.houseSpots[key];
                if (!def || !spots.length) continue;
                const mesh = new THREE.InstancedMesh(def.geo, bldMat, spots.length);
                const write = (i) => {
                    const sp = spots[i];
                    dummy.position.set(sp.x, sp.y !== undefined ? sp.y : 0.07, sp.z);
                    dummy.rotation.set(0, sp.ry, 0);
                    const s = sp.gone ? 0 : sp.s;
                    dummy.scale.set(s, s, s);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                };
                mesh.userData.edit = { key: 'h:' + key, spots, write, y0: 0.07 };
                for (let i = 0; i < spots.length; i++) {
                    write(i);
                    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
                }
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.root.add(mesh);
                this.propMeshes.push(mesh);
            }

            // GLB urban buildings (Manhattan / Brooklyn commercial & highrise) — one
            // InstancedMesh per building model.
            for (const key of Object.keys(this.buildingSpots)) {
                const def = this.buildingDefs[key];
                const spots = this.buildingSpots[key];
                if (!def || !spots.length) continue;
                const mesh = new THREE.InstancedMesh(def.geo, bldMat, spots.length);
                const write = (i) => {
                    const sp = spots[i];
                    dummy.position.set(sp.x, sp.y !== undefined ? sp.y : 0.05, sp.z);
                    dummy.rotation.set(0, sp.ry || 0, 0);
                    if (sp.gone) dummy.scale.set(0, 0, 0); else dummy.scale.set(sp.sx, sp.sy, sp.sz);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                };
                mesh.userData.edit = { key: 'b:' + key, spots, write, y0: 0.05 };
                for (let i = 0; i < spots.length; i++) {
                    write(i);
                    mesh.setColorAt(i, new THREE.Color(1, 1, 1));
                }
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.root.add(mesh);
                this.propMeshes.push(mesh);
            }

            // Traffic light lenses: basic material + per-instance dynamic color.
            if (this.propSpots.lens.length) {
                const b = new GeoBatch();
                b.box(0, 0, 0, 0.3, 0.26, 0.16, [1, 1, 1]);
                const geo = b.buildGeometry();
                const mesh = new THREE.InstancedMesh(geo, this.mat.basic, this.propSpots.lens.length);
                for (let i = 0; i < this.propSpots.lens.length; i++) {
                    const sp = this.propSpots.lens[i];
                    dummy.position.set(sp.x, sp.y, sp.z);
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    mesh.setColorAt(i, new THREE.Color(0.1, 0.1, 0.1));
                }
                if (mesh.instanceColor.setUsage) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
                mesh.instanceColor.needsUpdate = true;
                this.root.add(mesh);
                this.lensMesh = mesh;
                this.propMeshes.push(mesh);
            }
        }

        /**
         * Called by the TrafficLightSystem on phase changes.
         *
         * `phase` is an index rather than a pair of booleans because the cycle
         * has an all-red clearance interval, which no combination of "is NS
         * green / is NS yellow" can express:
         *   0 NS green · 1 NS yellow · 2 EW green · 3 EW yellow · 4 all red
         */
        setLensColors(lightEntry, phase) {
            const mesh = this.lensMesh;
            if (!mesh) return;
            const c = this._lensScratch || (this._lensScratch = new THREE.Color());
            // Per-lens lit and unlit colours. Index order matches the trio
            // layout: red (top), yellow, green.
            const lit = this._lensLit || (this._lensLit = [
                [1.00, 0.08, 0.08], [1.00, 0.82, 0.08], [0.10, 1.00, 0.28],
            ]);
            const dim = this._lensDim || (this._lensDim = [
                [0.17, 0.03, 0.03], [0.17, 0.13, 0.02], [0.02, 0.17, 0.05],
            ]);
            // Which lens of each trio is lit. 0 is the red one, so every phase
            // that is not this axis's green or amber falls through to it.
            const nsLit = phase === 0 ? 2 : phase === 1 ? 1 : 0;
            const ewLit = phase === 2 ? 2 : phase === 3 ? 1 : 0;
            for (let i = 0; i < 3; i++) {
                let k = nsLit === i ? lit[i] : dim[i];
                c.setRGB(k[0], k[1], k[2]);
                mesh.setColorAt(lightEntry.nsBase + i, c);
                k = ewLit === i ? lit[i] : dim[i];
                c.setRGB(k[0], k[1], k[2]);
                mesh.setColorAt(lightEntry.ewBase + i, c);
            }
            mesh.instanceColor.needsUpdate = true;
        }

        _buildQueensAndDocks() {
            const steelYellow = col3(0xf1c40f), steelDark = col3(0x34495e), craneOrange = col3(0xe67e22);
            const concreteGrey = col3(0x7f8c8d), dockWood = col3(0x5a4632), chromeSilver = col3(0xbdc3c7);
            const tankWhite = col3(0xecf0f1), brickRed = col3(0x962d22), windowGlass = col3(0x2c3e50);
            const containerColors = [
                col3(0x2980b9), // Maersk Sky Blue
                col3(0x27ae60), // Evergreen Forest Green
                col3(0xd35400), // Hapag-Lloyd Cadmium Orange
                col3(0xc0392b), // Mediterranean Red
                col3(0x8e44ad), // Ocean Network Express Violet
                col3(0x7f8c8d), // Steel Chrome
                col3(0xf39c12), // Cargo Gold
            ];

            // 1. Four Giant Harbor Container Gantry Cranes along Queens waterfront quay
            const craneZ = [620, 840, 1060, 1280];
            const quayX = 1355;
            for (let ci = 0; ci < craneZ.length; ci++) {
                const cz = craneZ[ci];
                // Quay concrete pad & heavy rail tracks
                this.fbox(quayX, 0.18, cz, 44, 0.36, 110, concreteGrey);
                this.fbox(quayX - 9, 0.38, cz, 0.8, 0.12, 106, steelDark);
                this.fbox(quayX + 9, 0.38, cz, 0.8, 0.12, 106, steelDark);

                // 4 massive portal legs (truss columns)
                const legW = 2.2, legH = 34;
                this.fbox(quayX - 8, legH / 2 + 0.3, cz - 11, legW, legH, legW, steelYellow);
                this.fbox(quayX - 8, legH / 2 + 0.3, cz + 11, legW, legH, legW, steelYellow);
                this.fbox(quayX + 8, legH / 2 + 0.3, cz - 11, legW, legH, legW, steelYellow);
                this.fbox(quayX + 8, legH / 2 + 0.3, cz + 11, legW, legH, legW, steelYellow);

                // Cross bracing trusses
                this.fbox(quayX, 18, cz - 11, 16, 1.4, 1.4, steelYellow);
                this.fbox(quayX, 18, cz + 11, 16, 1.4, 1.4, steelYellow);
                this.fbox(quayX - 8, 18, cz, 1.4, 1.4, 22, steelYellow);
                this.fbox(quayX + 8, 18, cz, 1.4, 1.4, 22, steelYellow);

                // Upper machinery deck & operator cabin
                this.fbox(quayX, 35.5, cz, 20, 3.0, 24, steelDark);
                this.fbox(quayX - 10, 38, cz - 6, 4.5, 4.0, 5.5, col3(0xffffff));
                this.fbox(quayX - 10, 38, cz - 6, 4.6, 2.0, 5.6, windowGlass);

                // Cantilever boom spanning out over water and container yard
                this.fbox(quayX - 6, 38.5, cz, 58, 3.4, 4.2, steelYellow);
                // A-frame tower atop crane for stay cables
                this.fcyl(quayX - 4, 47, cz - 4, 0.8, 1.4, 14, 8, steelYellow);
                this.fcyl(quayX - 4, 47, cz + 4, 0.8, 1.4, 14, 8, steelYellow);
                this.fbox(quayX - 4, 54, cz, 2.0, 1.5, 9.0, steelDark);

                // Trolley & suspended shipping container
                const trolleyX = quayX - 18 + (ci % 2) * 14;
                this.fbox(trolleyX, 36.2, cz, 4.2, 1.6, 3.6, steelDark);
                this.fcyl(trolleyX - 1.2, 26, cz - 1.0, 0.08, 0.08, 18, 6, chromeSilver);
                this.fcyl(trolleyX + 1.2, 26, cz - 1.0, 0.08, 0.08, 18, 6, chromeSilver);
                this.fcyl(trolleyX - 1.2, 26, cz + 1.0, 0.08, 0.08, 18, 6, chromeSilver);
                this.fcyl(trolleyX + 1.2, 26, cz + 1.0, 0.08, 0.08, 18, 6, chromeSilver);

                const contCol = containerColors[ci % containerColors.length];
                this.fbox(trolleyX, 16.8, cz, 12.2, 0.4, 2.6, steelDark);
                this.fbox(trolleyX, 15.3, cz, 12.2, 2.6, 2.5, contCol);

                this._collide(quayX - 8, legH / 2, cz - 11, legW, legH, legW, 'building');
                this._collide(quayX - 8, legH / 2, cz + 11, legW, legH, legW, 'building');
                this._collide(quayX + 8, legH / 2, cz - 11, legW, legH, legW, 'building');
                this._collide(quayX + 8, legH / 2, cz + 11, legW, legH, legW, 'building');
            }

            // 2. Shipping Container Yard Stacks
            const cRng = mulberry32(88421);
            const yardStartX = 1420, yardEndX = 1580;
            const yardStartZ = 600, yardEndZ = 1250;
            for (let z = yardStartZ; z <= yardEndZ; z += 38) {
                for (let x = yardStartX; x <= yardEndX; x += 32) {
                    const stackW = 12.2, stackD = 2.6;
                    const rows = 4, cols = 2;
                    const maxH = 1 + Math.floor(cRng() * 3);
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const curH = Math.max(1, maxH - Math.floor(cRng() * 1.5));
                            const px = x + c * 13.0;
                            const pz = z + r * 3.2;
                            for (let h = 0; h < curH; h++) {
                                const py = 0.2 + h * 2.6 + 1.3;
                                const col = containerColors[Math.floor(cRng() * containerColors.length)];
                                this.fbox(px, py, pz, stackW, 2.55, stackD, col);
                                this.fbox(px - stackW / 2 + 0.1, py, pz, 0.2, 2.55, stackD, steelDark);
                                this.fbox(px + stackW / 2 - 0.1, py, pz, 0.2, 2.55, stackD, steelDark);
                            }
                            this._collide(px, (curH * 2.6) / 2, pz, stackW, curH * 2.6, stackD, 'building');
                        }
                    }
                }
            }

            // 3. Petroleum Tank Farm & Distillation Refinery
            const tankCoords = [
                [1680, 740], [1770, 740],
                [1680, 910], [1770, 910],
                [1680, 1080], [1770, 1080]
            ];
            this.fbox(1725, 0.8, 910, 160, 1.6, 440, concreteGrey);
            this.fbox(1725, 0.2, 910, 156, 0.4, 436, col3(0x3a3a3a));

            for (const [tx, tz] of tankCoords) {
                const tankR = 17.5, tankH = 16.0;
                this.fcyl(tx, tankH / 2 + 0.2, tz, tankR, tankR, tankH, 24, tankWhite);
                this.fcyl(tx, tankH + 1.2, tz, 0.8, tankR + 0.4, 2.2, 24, col3(0xd5dbdb));
                this.fring(tx, tankH + 0.4, tz, tankR - 0.8, tankR, 24, steelDark, true);
                this.fbox(tx - tankR - 0.05, 8.0, tz, 0.1, 3.2, 3.2, col3(0xf1c40f));
                this.fbox(tx - tankR - 0.08, 8.0, tz, 0.1, 1.4, 1.4, col3(0xe74c3c));
                this.fcyl(tx + tankR + 1.2, 1.2, tz, 0.6, 0.6, 2.4, 10, chromeSilver);
                this._collide(tx, tankH / 2 + 0.2, tz, tankR * 2, tankH, tankR * 2, 'building');
            }

            // 2 Tall Refinery Distillation Towers
            const towers = [[1870, 830], [1870, 990]];
            for (const [twX, twZ] of towers) {
                this.fcyl(twX, 20, twZ, 2.8, 2.2, 40, 16, chromeSilver);
                for (let py = 7; py < 40; py += 7) {
                    this.fring(twX, py, twZ, 2.4, 4.4, 16, steelDark, true);
                    this.fbox(twX, py + 0.6, twZ + 3.8, 0.2, 1.1, 0.2, steelDark);
                }
                this.fbox(twX + 2.7, 20, twZ, 0.6, 39, 0.8, steelYellow);
                this.fcyl(twX, 42, twZ, 0.4, 0.4, 4.0, 8, steelDark);
                this.neonQuad(
                    [twX - 1.2, 44.2, twZ], [twX + 1.2, 44.2, twZ],
                    [twX + 0.4, 48.0, twZ], [twX - 0.4, 48.0, twZ],
                    [0, 0, 1], col3(0xff6b1a)
                );
                this.neonQuad(
                    [twX, 44.2, twZ - 1.2], [twX, 44.2, twZ + 1.2],
                    [twX, 48.0, twZ + 0.4], [twX, 48.0, twZ - 0.4],
                    [1, 0, 0], col3(0xffaa00)
                );
                this._collide(twX, 20, twZ, 6.0, 40, 6.0, 'building');
            }

            // 4. Sawtooth Brick Warehouses with Smokestacks
            const whList = [
                { x: 1470, z: 1420, w: 56, d: 38, h: 12 },
                { x: 1560, z: 1420, w: 56, d: 38, h: 12 },
                { x: 1470, z: 1540, w: 56, d: 38, h: 12 },
                { x: 1560, z: 1540, w: 56, d: 38, h: 12 },
            ];
            for (const wh of whList) {
                this.fbox(wh.x, wh.h / 2 + 0.2, wh.z, wh.w, wh.h, wh.d, brickRed);
                const ridgeStep = wh.w / 4;
                for (let k = 0; k < 4; k++) {
                    const rx = wh.x - wh.w / 2 + (k + 0.5) * ridgeStep;
                    this.fbox(rx, wh.h + 2.0, wh.z, ridgeStep * 0.92, 3.8, wh.d, col3(0x4a4a4e));
                    this.fbox(rx, wh.h + 2.2, wh.z - wh.d / 2 + 0.2, ridgeStep * 0.85, 2.6, 0.4, col3(0x74b9ff));
                }
                this.fbox(wh.x, 2.5, wh.z + wh.d / 2 + 0.1, 7.5, 4.8, 0.4, steelDark);
                this.fbox(wh.x - 16, 2.5, wh.z + wh.d / 2 + 0.1, 7.5, 4.8, 0.4, steelDark);
                this.fbox(wh.x + 16, 2.5, wh.z + wh.d / 2 + 0.1, 7.5, 4.8, 0.4, steelDark);
                this.fbox(wh.x, 0.4, wh.z + wh.d / 2 + 0.6, 8.0, 0.8, 0.8, col3(0xf1c40f));
                this._collide(wh.x, wh.h / 2, wh.z, wh.w, wh.h + 3.5, wh.d, 'building');
            }
            const smokestacks = [[1620, 1380], [1620, 1500]];
            for (const [sx, sz] of smokestacks) {
                this.fcyl(sx, 22, sz, 2.8, 1.8, 44, 18, brickRed);
                this.fcyl(sx, 44, sz, 2.0, 2.0, 1.8, 18, col3(0x1a1a1a));
                this._collide(sx, 22, sz, 5.6, 44, 5.6, 'building');
            }

            // 5. "Lucky Pelican" Seafood Diner & Wooden Harbor Pier
            const dinerX = 1315, dinerZ = 1420;
            this.fbox(dinerX, 2.6, dinerZ, 24, 4.8, 13, chromeSilver);
            this.fbox(dinerX, 1.0, dinerZ, 24.2, 1.6, 13.2, col3(0x16a085));
            this.fbox(dinerX, 4.8, dinerZ, 24.2, 0.8, 13.2, col3(0x16a085));
            this.fbox(dinerX, 2.7, dinerZ, 24.1, 1.8, 13.1, col3(0x81ecec));
            this.neonQuad(
                [dinerX - 7, 5.8, dinerZ], [dinerX + 7, 5.8, dinerZ],
                [dinerX + 7, 7.6, dinerZ], [dinerX - 7, 7.6, dinerZ],
                [0, 0, 1], col3(0x00cec9)
            );
            this._collide(dinerX, 2.6, dinerZ, 24, 5.0, 13, 'building');

            const pierLen = 74, pierW = 10;
            const pierCX = dinerX - 12 - pierLen / 2;
            this.fbox(pierCX, 0.85, dinerZ, pierLen, 0.45, pierW, dockWood);
            for (let px = dinerX - 14; px > dinerX - 12 - pierLen; px -= 10) {
                this.fcyl(px, 0.0, dinerZ - pierW / 2 + 0.6, 0.35, 0.35, 3.2, 8, col3(0x3e2723));
                this.fcyl(px, 0.0, dinerZ + pierW / 2 - 0.6, 0.35, 0.35, 3.2, 8, col3(0x3e2723));
                this.fcyl(px, 1.3, dinerZ - pierW / 2 + 0.6, 0.18, 0.22, 0.5, 8, col3(0x2d3436));
                this.fcyl(px, 1.3, dinerZ + pierW / 2 - 0.6, 0.18, 0.22, 0.5, 8, col3(0x2d3436));
            }
        }

        _buildViceShores() {
            const sandGold = col3(0xe6ca7d), stuccoPink = col3(0xf8a5c2), stuccoTeal = col3(0x7bed9f);
            const stuccoWhite = col3(0xf5f6fa), stuccoCoral = col3(0xff793f), neonCyan = col3(0x00d2d3);
            const neonMagenta = col3(0xff3f80), poolTeal = col3(0x1dd1a1), deckWood = col3(0x8a6d4b);
            const chromeSilver = col3(0xdfe4ea), darkNavy = col3(0x1e272e), glassCyan = col3(0x48dbfb);

            // 1. Vast Oceanfront Beach Strip
            const beachRng = mulberry32(49201);
            for (let bz = 2050; bz <= 3550; bz += 100) {
                this.fbox(2125, 0.08, bz, 140, 0.25, 104, sandGold);
            }

            // 4 Lifeguard Watchtowers
            const guardTowers = [
                { z: 2180, c: col3(0x1abc9c) },
                { z: 2520, c: col3(0xff6b6b) },
                { z: 2880, c: col3(0xf1c40f) },
                { z: 3240, c: col3(0x3498db) },
            ];
            for (const gt of guardTowers) {
                const gx = 2115, gz = gt.z;
                this.fcyl(gx - 2.0, 1.9, gz - 2.0, 0.16, 0.16, 3.8, 6, col3(0x6d4c41));
                this.fcyl(gx + 2.0, 1.9, gz - 2.0, 0.16, 0.16, 3.8, 6, col3(0x6d4c41));
                this.fcyl(gx - 2.0, 1.9, gz + 2.0, 0.16, 0.16, 3.8, 6, col3(0x6d4c41));
                this.fcyl(gx + 2.0, 1.9, gz + 2.0, 0.16, 0.16, 3.8, 6, col3(0x6d4c41));
                this.fbox(gx, 3.85, gz, 5.6, 0.25, 5.6, deckWood);
                this.fbox(gx, 5.4, gz, 4.0, 2.8, 4.0, gt.c);
                this.fbox(gx, 5.6, gz - 2.02, 3.4, 1.2, 0.1, glassCyan);
                this.fbox(gx, 5.6, gz + 2.02, 3.4, 1.2, 0.1, glassCyan);
                this.fbox(gx - 2.02, 5.6, gz, 0.1, 1.2, 3.4, glassCyan);
                this.fbox(gx + 2.02, 5.6, gz, 0.1, 1.2, 3.4, glassCyan);
                this.fbox(gx, 7.0, gz, 5.2, 0.4, 5.2, stuccoWhite);
                this.fbox(gx - 2.8, 2.0, gz, 0.3, 4.0, 1.0, col3(0xffffff));
                this.fcyl(gx + 2.05, 5.0, gz, 0.4, 0.4, 0.12, 12, col3(0xff3838), { rx: Math.PI / 2 });
                this._collide(gx, 2.8, gz, 4.8, 5.6, 4.8, 'building');
            }

            // Beach Umbrellas and Sun Loungers pairs
            const umbrellaColors = [col3(0xff6b81), col3(0x00d2d3), col3(0xffa502), col3(0x2ed573), col3(0x70a1ff)];
            for (let bz = 2100; bz <= 3500; bz += 55) {
                const ux = 2135 + (beachRng() - 0.5) * 16;
                const uz = bz + (beachRng() - 0.5) * 16;
                const uCol = umbrellaColors[Math.floor(beachRng() * umbrellaColors.length)];
                this.fcyl(ux, 1.4, uz, 0.05, 0.05, 2.8, 6, chromeSilver);
                this.fdisc(ux, 2.65, uz, 1.9, 8, uCol, true);
                this.fcyl(ux, 2.8, uz, 0.02, 1.8, 0.45, 8, stuccoWhite);
                for (const side of [-1, 1]) {
                    const lx = ux + side * 1.3, lz = uz;
                    this.fbox(lx, 0.22, lz, 0.7, 0.22, 1.9, stuccoWhite);
                    this.fbox(lx, 0.45, lz + 0.6, 0.7, 0.35, 0.6, uCol);
                }
            }

            // 2 Beach Volleyball Courts
            const courts = [2340, 3020];
            for (const cz of courts) {
                const cx = 2110;
                this.fbox(cx, 0.18, cz, 16.0, 0.14, 28.0, deckWood);
                this.fbox(cx, 0.14, cz, 15.2, 0.12, 27.2, sandGold);
                this.fcyl(cx - 8.2, 1.3, cz, 0.1, 0.1, 2.6, 6, deckWood);
                this.fcyl(cx + 8.2, 1.3, cz, 0.1, 0.1, 2.6, 6, deckWood);
                this.fquad(
                    [cx - 8.0, 1.4, cz], [cx + 8.0, 1.4, cz],
                    [cx + 8.0, 2.4, cz], [cx - 8.0, 2.4, cz],
                    [0, 0, 1], col3(0xffffff)
                );
            }

            // 2. Ocean Drive Art Deco Boutique Hotels
            // Hotel 1: "The Flamingo"
            const h1X = 1760, h1Z = 2260;
            this.fbox(h1X, 17, h1Z, 38, 34, 46, stuccoPink);
            for (let y = 5; y < 34; y += 3.5) {
                this.fbox(h1X - 19.5, y, h1Z, 2.2, 0.4, 44, stuccoWhite);
                this.fbox(h1X - 20.4, y + 0.5, h1Z, 0.2, 0.6, 44, chromeSilver);
            }
            this.fbox(h1X, 35.5, h1Z, 24, 3.0, 30, stuccoWhite);
            this.neonQuad(
                [h1X - 19.2, 35.0, h1Z - 10], [h1X - 19.2, 35.0, h1Z + 10],
                [h1X - 19.2, 37.5, h1Z + 10], [h1X - 19.2, 37.5, h1Z - 10],
                [-1, 0, 0], neonMagenta
            );
            this._collide(h1X, 17, h1Z, 40, 34, 46, 'building');

            // Hotel 2: "The Nautilus"
            const h2X = 1760, h2Z = 2500;
            this.fbox(h2X, 19, h2Z, 40, 38, 44, stuccoTeal);
            this.fcyl(h2X - 20, 19, h2Z, 5.0, 5.0, 38, 16, stuccoWhite);
            this.fbox(h2X - 24.5, 20, h2Z, 0.4, 42, 1.2, neonCyan);
            this.neonQuad(
                [h2X - 24.8, 4, h2Z], [h2X - 24.8, 41, h2Z],
                [h2X - 24.8, 41, h2Z + 0.5], [h2X - 24.8, 4, h2Z + 0.5],
                [-1, 0, 0], neonCyan
            );
            this._collide(h2X, 19, h2Z, 42, 38, 44, 'building');

            // Hotel 3: "The Delano Palms"
            const h3X = 1760, h3Z = 2740;
            this.fbox(h3X, 21, h3Z, 42, 42, 44, stuccoWhite);
            for (let cz = h3Z - 14; cz <= h3Z + 14; cz += 7) {
                this.fcyl(h3X - 22, 4.0, cz, 0.8, 0.8, 8.0, 12, stuccoWhite);
            }
            this.fbox(h3X, 42.4, h3Z, 40, 0.4, 42, col3(0xe0e0e0));
            this.fbox(h3X, 42.45, h3Z, 16, 0.05, 26, poolTeal);
            this._collide(h3X, 21, h3Z, 44, 42, 44, 'building');

            // Hotel 4: "The Clevelander"
            const h4X = 1760, h4Z = 2980;
            this.fbox(h4X, 15, h4Z, 38, 30, 44, stuccoCoral);
            this.fbox(h4X, 31, h4Z, 32, 2.0, 36, darkNavy);
            this.fbox(h4X, 33, h4Z, 22, 2.0, 26, stuccoWhite);
            this.neonQuad(
                [h4X - 19.2, 10, h4Z - 12], [h4X - 19.2, 10, h4Z + 12],
                [h4X - 19.2, 13, h4Z + 12], [h4X - 19.2, 13, h4Z - 12],
                [-1, 0, 0], col3(0xfffa65)
            );
            this._collide(h4X, 15, h4Z, 40, 30, 44, 'building');

            // 3. Luxury Yacht Marina
            const marinaCX = 1420, marinaCZ = 2280;
            this.fbox(marinaCX, 0.85, marinaCZ, 12, 0.45, 180, deckWood);
            for (let fz of [marinaCZ - 55, marinaCZ, marinaCZ + 55]) {
                this.fbox(marinaCX - 32, 0.85, fz, 54, 0.45, 6, deckWood);
                const yx = marinaCX - 32, yz = fz + 9;
                this.fbox(yx, 1.2, yz, 18.0, 1.8, 4.8, stuccoWhite);
                this.fbox(yx - 8.2, 1.4, yz, 2.2, 1.6, 3.4, stuccoWhite);
                this.fbox(yx, 0.6, yz, 18.2, 0.3, 4.9, darkNavy);
                this.fbox(yx + 1.0, 2.7, yz, 10.0, 1.5, 3.8, stuccoWhite);
                this.fbox(yx + 1.0, 2.8, yz, 10.2, 0.9, 3.9, darkNavy);
                this.fcyl(yx + 4.5, 4.2, yz - 1.6, 0.08, 0.08, 1.8, 6, chromeSilver);
                this.fcyl(yx + 4.5, 4.2, yz + 1.6, 0.08, 0.08, 1.8, 6, chromeSilver);
                this.fbox(yx + 4.5, 5.1, yz, 0.4, 0.15, 3.4, chromeSilver);
                this.fcyl(yx + 4.5, 5.5, yz, 0.35, 0.4, 0.5, 10, stuccoWhite);
                this.fbox(yx + 9.6, 0.6, yz, 1.4, 0.2, 4.2, deckWood);
                this._collide(yx, 1.8, yz, 18.0, 3.5, 5.0, 'building');
            }

            // 4. Tropical Royal Palm Tree Promenade
            for (let pz = 2100; pz <= 3400; pz += 40) {
                for (const side of [-1, 1]) {
                    const px = 1800 + side * 14;
                    this.fcyl(px, 5.0, pz, 0.35, 0.25, 10.0, 8, col3(0x8d6e63));
                    this.fbox(px, 10.2, pz, 5.0, 1.0, 5.0, col3(0x27ae60));
                    this.fbox(px, 9.4, pz, 6.6, 0.7, 6.6, col3(0x2ecc71));
                    this.fbox(px, 0.2, pz, 2.4, 0.4, 2.4, stuccoWhite);
                    this._collide(px, 2.5, pz, 0.8, 5.0, 0.8, 'tree');
                }
            }
        }

        _buildGovernorsIsland() {
            const stoneWall = col3(0x57606f), stoneDark = col3(0x3d444e), ironCannon = col3(0x1e272e);
            const woodCarriage = col3(0x5c4033), concreteHeli = col3(0x95a5a6), markYellow = col3(0xf1c40f);
            const mastSteel = col3(0xbdc3c7), bunkerOlive = col3(0x535c68), beaconRed = col3(0xff3838);

            // 1. Historic Stone Star Fortress Ramparts
            const fortCX = 700, fortCZ = 3550;
            const fortR = 64, wallH = 7.5, wallThick = 5.0;
            const bastions = 5;
            for (let b = 0; b < bastions; b++) {
                const ang1 = (b / bastions) * Math.PI * 2;
                const ang2 = ((b + 1) / bastions) * Math.PI * 2;
                const x1 = fortCX + Math.cos(ang1) * fortR;
                const z1 = fortCZ + Math.sin(ang1) * fortR;
                const x2 = fortCX + Math.cos(ang2) * fortR;
                const z2 = fortCZ + Math.sin(ang2) * fortR;
                const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
                const dx = x2 - x1, dz = z2 - z1;
                const segLen = Math.hypot(dx, dz);
                const yaw = Math.atan2(dx, dz);

                this.fbox(mx, wallH / 2 + 0.2, mz, wallThick, wallH, segLen, stoneWall, { ry: yaw });
                this.fbox(mx, wallH + 0.6, mz, 1.2, 1.2, segLen, stoneDark, { ry: yaw });
                this._collide(mx, wallH / 2, mz, wallThick * 1.4, wallH + 1.2, segLen, 'building');

                this.fcyl(x1, wallH / 2 + 0.2, z1, 6.0, 5.2, wallH, 12, stoneWall);
                this._collide(x1, wallH / 2, z1, 11, wallH, 11, 'building');
            }

            // 6 Heavy Naval Iron Cannons
            const cannonSpots = [
                { x: fortCX - 56, z: fortCZ - 24, yaw: -Math.PI * 0.45 },
                { x: fortCX - 54, z: fortCZ + 12, yaw: -Math.PI * 0.60 },
                { x: fortCX - 24, z: fortCZ - 55, yaw: -Math.PI * 0.20 },
                { x: fortCX + 14, z: fortCZ - 57, yaw: -Math.PI * 0.05 },
                { x: fortCX - 40, z: fortCZ + 44, yaw: -Math.PI * 0.75 },
                { x: fortCX + 45, z: fortCZ - 42, yaw: Math.PI * 0.15 },
            ];
            for (const cs of cannonSpots) {
                this.fbox(cs.x, wallH + 0.7, cs.z, 1.4, 0.9, 2.4, woodCarriage, { ry: cs.yaw });
                for (const wx of [-0.75, 0.75]) {
                    for (const wz of [-0.8, 0.8]) {
                        this.fcyl(cs.x + wx, wallH + 0.35, cs.z + wz, 0.35, 0.35, 0.15, 8, col3(0xd35400), { rz: Math.PI / 2 });
                    }
                }
                this.fcyl(cs.x, wallH + 1.2, cs.z, 0.38, 0.28, 3.4, 10, ironCannon, { rx: Math.PI / 2 + 0.08, ry: cs.yaw });
                const cxp = cs.x + Math.sin(cs.yaw + 1.4) * 2.2;
                const czp = cs.z + Math.cos(cs.yaw + 1.4) * 2.2;
                for (let k = 0; k < 4; k++) {
                    this.fcyl(cxp + (k % 2) * 0.3, wallH + 0.2, czp + Math.floor(k / 2) * 0.3, 0.14, 0.14, 0.28, 6, ironCannon);
                }
            }

            // 2. Tactical Military Helipad
            const heliX = 645, heliZ = 3520;
            this.fbox(heliX, 0.6, heliZ, 28, 1.2, 28, concreteHeli);
            this.fring(heliX, 1.25, heliZ, 9.8, 10.6, 24, markYellow, true);
            this.fbox(heliX - 3.2, 1.25, heliZ, 1.2, 0.04, 7.2, col3(0xffffff));
            this.fbox(heliX + 3.2, 1.25, heliZ, 1.2, 0.04, 7.2, col3(0xffffff));
            this.fbox(heliX, 1.25, heliZ, 5.2, 0.04, 1.2, col3(0xffffff));
            for (let a = 0; a < 8; a++) {
                const ang = (a / 8) * Math.PI * 2;
                const lx = heliX + Math.cos(ang) * 12.5;
                const lz = heliZ + Math.sin(ang) * 12.5;
                this.fcyl(lx, 1.4, lz, 0.12, 0.12, 0.4, 6, markYellow);
                this.fcyl(lx, 1.65, lz, 0.15, 0.15, 0.15, 6, col3(0x2ecc71));
            }
            this._collide(heliX, 0.6, heliZ, 28, 1.2, 28, 'building');

            // 3. Steel Lattice Naval Communications Radar Mast
            const mastX = 740, mastZ = 3600;
            const mastH = 38;
            this.fbox(mastX - 2.5, mastH / 2, mastZ - 2.5, 0.6, mastH, 0.6, mastSteel);
            this.fbox(mastX + 2.5, mastH / 2, mastZ - 2.5, 0.6, mastH, 0.6, mastSteel);
            this.fbox(mastX - 2.5, mastH / 2, mastZ + 2.5, 0.6, mastH, 0.6, mastSteel);
            this.fbox(mastX + 2.5, mastH / 2, mastZ + 2.5, 0.6, mastH, 0.6, mastSteel);
            for (let y = 6; y < mastH; y += 6) {
                this.fbox(mastX, y, mastZ - 2.5, 5.0, 0.4, 0.4, mastSteel);
                this.fbox(mastX, y, mastZ + 2.5, 5.0, 0.4, 0.4, mastSteel);
                this.fbox(mastX - 2.5, y, mastZ, 0.4, 0.4, 5.0, mastSteel);
                this.fbox(mastX + 2.5, y, mastZ, 0.4, 0.4, 5.0, mastSteel);
            }
            this.fcyl(mastX + 2.8, 28, mastZ, 2.0, 0.4, 1.0, 16, col3(0xecf0f1), { rz: Math.PI / 2 });
            this.fcyl(mastX, 33, mastZ - 2.8, 1.8, 0.4, 1.0, 16, col3(0xecf0f1), { rx: Math.PI / 2 });
            this.fcyl(mastX, mastH + 1.5, mastZ, 0.25, 0.25, 3.0, 6, mastSteel);
            this.neonQuad(
                [mastX - 0.4, mastH + 3.0, mastZ], [mastX + 0.4, mastH + 3.0, mastZ],
                [mastX + 0.4, mastH + 3.8, mastZ], [mastX - 0.4, mastH + 3.8, mastZ],
                [0, 0, 1], beaconRed
            );
            this._collide(mastX, mastH / 2, mastZ, 6.0, mastH, 6.0, 'building');

            // 4. Garrison Command Bunker & Armory Quonset Huts
            const bunkerX = 720, bunkerZ = 3490;
            this.fbox(bunkerX, 4.2, bunkerZ, 32, 8.4, 18, bunkerOlive);
            this.fbox(bunkerX, 8.6, bunkerZ, 33, 0.8, 19, col3(0x2f3640));
            this.fbox(bunkerX - 8, 2.5, bunkerZ + 9.1, 4.4, 5.0, 0.3, col3(0x2f3542));
            this._collide(bunkerX, 4.2, bunkerZ, 32, 8.4, 18, 'building');

            for (const qz of [3470, 3510]) {
                const qx = 765;
                this.fcyl(qx, 3.2, qz, 4.5, 4.5, 22, 16, col3(0x95a5a6), { rx: Math.PI / 2 });
                this.fbox(qx, 1.6, qz, 9.2, 3.2, 22, col3(0x747d8c));
                this._collide(qx, 2.5, qz, 9.5, 5.0, 22, 'building');
            }
        }

        // ---- minimap atlas ------------------------------------------------------------
        // Hi-res north-up atlas (s px per meter). Rotating minimap + big map
        // both sample from this. Text-free: labels live in the big map so the
        // rotating view stays legible. Landmarks are color-coded footprints
        // (not 4px dots) so major buildings read at any zoom.
        _renderMinimap() {
            const s = 0.7; // px per meter (~1422x2906, ~4M px one-time cost)
            const pad = 4;
            const w = Math.ceil((WORLD.MAX_X - WORLD.MIN_X) * s) + pad * 2;
            const h = Math.ceil((WORLD.MAX_Z - WORLD.MIN_Z) * s) + pad * 2;
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            const X = (x) => (x - WORLD.MIN_X) * s + pad;
            const Z = (z) => (z - WORLD.MIN_Z) * s + pad;
            // Water.
            ctx.fillStyle = '#122639';
            ctx.fillRect(0, 0, w, h);
            // Land.
            const fillPoly = (poly, color) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(X(poly[0][0]), Z(poly[0][1]));
                for (let i = 1; i < poly.length; i++) ctx.lineTo(X(poly[i][0]), Z(poly[i][1]));
                ctx.closePath();
                ctx.fill();
            };
            const strokePoly = (poly, color, lw) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.beginPath();
                ctx.moveTo(X(poly[0][0]), Z(poly[0][1]));
                for (let i = 1; i < poly.length; i++) ctx.lineTo(X(poly[i][0]), Z(poly[i][1]));
                ctx.closePath();
                ctx.stroke();
            };
            fillPoly(ISLAND, '#262b33');
            fillPoly(BROOKLYN_POLY, '#262b33');
            fillPoly(STATUE_POLY, '#2f4a2e');
            if (typeof PARADISE_SOUTH_POLY !== 'undefined') fillPoly(PARADISE_SOUTH_POLY, '#262b33');
            if (typeof PARADISE_NORTH_POLY !== 'undefined') fillPoly(PARADISE_NORTH_POLY, '#1e382b');
            if (typeof QUEENS_POLY !== 'undefined') fillPoly(QUEENS_POLY, '#282d36');
            if (typeof VICE_SHORES_POLY !== 'undefined') fillPoly(VICE_SHORES_POLY, '#2b303a');
            if (typeof GOVERNORS_POLY !== 'undefined') fillPoly(GOVERNORS_POLY, '#242830');
            strokePoly(ISLAND, '#4a6b8a', 2);
            strokePoly(BROOKLYN_POLY, '#4a6b8a', 2);
            if (typeof PARADISE_SOUTH_POLY !== 'undefined') strokePoly(PARADISE_SOUTH_POLY, '#4a6b8a', 2);
            if (typeof PARADISE_NORTH_POLY !== 'undefined') strokePoly(PARADISE_NORTH_POLY, '#4a6b8a', 2);
            if (typeof QUEENS_POLY !== 'undefined') strokePoly(QUEENS_POLY, '#4a6b8a', 2);
            if (typeof VICE_SHORES_POLY !== 'undefined') strokePoly(VICE_SHORES_POLY, '#e5b869', 3); // Golden beach rim
            if (typeof GOVERNORS_POLY !== 'undefined') strokePoly(GOVERNORS_POLY, '#4a6b8a', 2);
            // Parks (Central Park reads as the big green rectangle).
            for (const [x1, z1, x2, z2] of PARKS) {
                ctx.fillStyle = (x2 - x1) > 200 ? '#2e6b2e' : '#2e5a2c';
                ctx.fillRect(X(x1), Z(z1), (x2 - x1) * s, (z2 - z1) * s);
            }
            // Central Park reservoir: blue ellipse so the park isn't flat.
            if (typeof CENTRAL_PARK !== 'undefined' && CENTRAL_PARK.reservoir) {
                const r = CENTRAL_PARK.reservoir;
                ctx.fillStyle = '#274e6b';
                ctx.beginPath();
                ctx.ellipse(X(r.cx), Z(r.cz), r.rx * s, r.rz * s, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            // Roads: dark casing pass first (contrast), then bright fill pass.
            // This is what makes the grid legible on the dark land color.
            const segPath = (seg) => {
                ctx.beginPath();
                ctx.moveTo(X(seg.ax), Z(seg.az));
                ctx.lineTo(X(seg.bx), Z(seg.bz));
            };
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const seg of this.map.segments) {
                const isBway = seg.name === 'Broadway';
                const isModern = seg.bridge && seg.bridge.modern;
                const lw = isModern ? (seg.width > 12 ? 8 : 5.5) : (seg.bridge ? 6 : (seg.major || isBway ? 6 : 3.5));
                ctx.strokeStyle = 'rgba(8,10,14,0.95)';
                ctx.lineWidth = lw + 2.5;
                segPath(seg);
                ctx.stroke();
            }
            for (const seg of this.map.segments) {
                const isBway = seg.name === 'Broadway';
                const isModern = seg.bridge && seg.bridge.modern;
                if (isModern) {
                    ctx.strokeStyle = seg.width > 12 ? '#ffffff' : '#d8e4f0';
                    ctx.lineWidth = seg.width > 12 ? 6.5 : 4.5;
                } else if (seg.bridge) {
                    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 5;
                } else if (isBway) {
                    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 4.5;
                } else if (seg.major) {
                    ctx.strokeStyle = '#e8eaed'; ctx.lineWidth = 4.5;
                } else {
                    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2.2;
                }
                segPath(seg);
                ctx.stroke();
            }
            // Landmark footprints: color-coded by kind, white-stroked so they
            // pop against roads at minimap scale.
            const LM_COLOR = {
                empire: '#ffd24b', chrysler: '#ffd24b', flatiron: '#ffd24b',
                timessq: '#ff5fc8', wtc: '#7ec8ff', grandcentral: '#ffb04b',
                rockefeller: '#ffb04b', msg: '#c89bff', un: '#7ec8ff',
                met: '#8affda', guggenheim: '#8affda', cathedral: '#e8e8e8',
                hospital: '#ff6b6b', police: '#4b8bff', precinct: '#4b8bff', apollo: '#ff8a5c',
                spray: '#ff9a3d', parking: '#2b6cb0', gunshop: '#ff3b30', foodshop: '#ff9500',
                villa_estate: '#ffd700', villa_garage: '#34c759', river_promenade: '#2bbbd4', paradise_plaza: '#00d2ff',
                liberty_plaza: '#00e5ff',
            };
            const LM_NAME = {
                empire: 'Empire State', chrysler: 'Chrysler', flatiron: 'Flatiron',
                timessq: 'Times Square', wtc: 'One WTC', grandcentral: 'Grand Central',
                rockefeller: 'Rockefeller', msg: 'MSG', un: 'UN HQ',
                met: 'The Met', guggenheim: 'Guggenheim', cathedral: 'St. Patrick',
                hospital: 'Bellevue Hospital', police: 'Metro Police HQ', precinct: 'NYPD Precinct', apollo: 'Apollo',
                spray: 'Pay-N-Spray', parking: 'Car Park', gunshop: 'Ammu-Nation', foodshop: 'Food & Dining',
                villa_estate: 'VIP Modern Villa', villa_garage: 'VIP Villa Garage', river_promenade: 'River Promenade', paradise_plaza: 'Paradise City Plaza',
                liberty_plaza: 'Liberty Overlook Plaza',
            };
            const lmMeta = [];
            for (const lm of LANDMARKS) {
                const kind = lm.kind || lm[5];
                const color = LM_COLOR[kind] || '#ffd24b';
                const x1 = X(lm.x1), z1 = Z(lm.z1);
                const ww = Math.max((lm.x2 - lm.x1) * s, 7);
                const hh = Math.max((lm.z2 - lm.z1) * s, 7);
                ctx.fillStyle = color;
                ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x1, z1, ww, hh, 2);
                else ctx.rect(x1, z1, ww, hh);
                ctx.fill();
                ctx.stroke();

                if (kind === 'parking') {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('P', x1 + ww / 2, z1 + hh / 2);
                }

                const id = lm.id || lm[0];
                let name = LM_NAME[kind] || kind;
                if (id === 'spray2') name += ' II';
                else if (id === 'spray1') name += ' I';
                else if (id === 'parking_midtown') name = 'Midtown Parking';
                else if (id === 'parking_fidi') name = 'Wall St Parking';
                else if (id === 'parking_bk') name = 'Brooklyn Car Park';
                else if (id === 'parking_uptown') name = 'Uptown Parking';

                lmMeta.push({
                    id, kind,
                    name,
                    cx: (lm.x1 + lm.x2) / 2, cz: (lm.z1 + lm.z2) / 2,
                    color,
                });
            }
            this.minimapAtlas = cv;
            this.minimapMeta = { s, ox: pad, oz: pad, w, h };
            this.minimapLandmarks = lmMeta;
        }

        // ---- build pipeline --------------------------------------------------------------
        /**
         * Time-sliced build: each frame gets ~14 ms of work so the loading
         * screen keeps animating. Resolves with the finished builder.
         */
        buildAsync(onProgress) {
            return new Promise((resolve, reject) => {
                const queue = [];
                const report = () => onProgress && onProgress(queue[0] ? queue[0].label : 'Done', this._progress || 0);
                const tick = () => {
                    const t0 = performance.now();
                    try {
                        while (queue.length && performance.now() - t0 < 14) {
                            if (queue[0].fn()) queue.shift();
                        }
                    } catch (err) {
                        reject(err);
                        return;
                    }
                    if (queue.length) {
                        report();
                        requestAnimationFrame(tick);
                    } else {
                        resolve(this);
                    }
                };
                queue.push({
                    label: 'Surveying the grid', fn: () => {
                        this.map.derive();
                        this._queueBody(queue);
                        return true;
                    },
                });
                requestAnimationFrame(tick);
            });
        }

        _queueBody(queue) {
            queue.push({ label: 'Pouring the rivers', fn: () => { this._buildGround(); return true; } });
            queue.push({ label: 'Paving Manhattan', fn: () => { this._buildRoads(); return true; } });
            // Blocks: sliced so each frame only fills a few.
            const blocks = this.map.blocks;
            let bi = 0;
            queue.push({
                label: 'Raising the skyline', fn: () => {
                    const end = Math.min(bi + 4, blocks.length);
                    for (; bi < end; bi++) this.fillBlock(blocks[bi]);
                    this._progress = bi / blocks.length;
                    return bi >= blocks.length;
                },
            });
            queue.push({ label: 'Placing the landmarks', fn: () => { this._buildLandmarks(); return true; } });
            queue.push({ label: 'Landscaping Central Park', fn: () => { this._buildParks(); return true; } });
            queue.push({ label: 'Stringing the bridges', fn: () => { this._buildBridges(); return true; } });
            queue.push({ label: 'Crafting Paradise & VIP Villa', fn: () => { this._buildParadiseAndVilla(); return true; } });
            queue.push({ label: 'Constructing Queens & Industrial Harbor', fn: () => { this._buildQueensAndDocks(); return true; } });
            queue.push({ label: 'Building Vice Shores & Ocean Drive', fn: () => { this._buildViceShores(); return true; } });
            queue.push({ label: 'Fortifying Governors Island', fn: () => { this._buildGovernorsIsland(); return true; } });
            queue.push({ label: 'Planting street props', fn: () => { this._placeStreetProps(); return true; } });
            // Chunk mesh building, also sliced (records are collected lazily —
            // the chunks only exist once the steps above have run).
            queue.push({
                label: 'Welding the geometry', fn: () => {
                    if (!this._weldRecords) {
                        this._weldRecords = [];
                        this._weldIdx = 0;
                        for (let i = 0; i < this.chunks.length; i++) if (this.chunks[i]) this._weldRecords.push(this.chunks[i]);
                    }
                    const recs = this._weldRecords;
                    const end = Math.min(this._weldIdx + 3, recs.length);
                    for (; this._weldIdx < end; this._weldIdx++) this._buildChunkMesh(recs[this._weldIdx]);
                    this._progress = recs.length ? this._weldIdx / recs.length : 1;
                    return this._weldIdx >= recs.length;
                },
            });
            queue.push({
                label: 'Inking the minimap', fn: () => {
                    this._buildPropMeshes();
                    this._sanitizeColliders();
                    this._pruneSidewalkNodesInColliders();
                    this._renderMinimap();
                    return true;
                },
            });
        }

        /**
         * Clean up colliders: ensure all values are finite, extents are positive,
         * and remove any exact duplicate AABBs so every collider is unique and valid.
         */
        _sanitizeColliders() {
            if (!this.colliders || !this.colliders.length) return;
            const seen = new Set();
            const clean = [];
            for (let i = 0; i < this.colliders.length; i++) {
                const c = this.colliders[i];
                if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z) ||
                    !Number.isFinite(c.sx) || !Number.isFinite(c.sy) || !Number.isFinite(c.sz) ||
                    c.sx <= 0.05 || c.sy <= 0.05 || c.sz <= 0.05) {
                    continue;
                }
                const qx = Math.round(c.x * 20);
                const qy = Math.round(c.y * 20);
                const qz = Math.round(c.z * 20);
                const qsx = Math.round(c.sx * 20);
                const qsy = Math.round(c.sy * 20);
                const qsz = Math.round(c.sz * 20);
                const key = `${qx}_${qy}_${qz}_${qsx}_${qsy}_${qsz}`;
                if (seen.has(key)) continue;
                seen.add(key);
                clean.push(c);
            }
            this.colliders = clean;
        }

        /**
         * Drop sidewalk nodes that ended up inside something solid (a landmark
         * podium, a stoop, a tree trunk) and unlink them. Colliders are bucketed
         * first — the old pairwise scan was ~5k nodes x ~5k colliders.
         */
        _pruneSidewalkNodesInColliders() {
            if (!this.map || !this.map.sidewalkNodes || !this.colliders) return;
            const nodes = this.map.sidewalkNodes;
            const CELL = 24, hash = new Map();
            for (let c = 0; c < this.colliders.length; c++) {
                const col = this.colliders[c];
                const x0 = Math.floor((col.x - col.sx / 2 - 0.3) / CELL);
                const x1 = Math.floor((col.x + col.sx / 2 + 0.3) / CELL);
                const z0 = Math.floor((col.z - col.sz / 2 - 0.3) / CELL);
                const z1 = Math.floor((col.z + col.sz / 2 + 0.3) / CELL);
                for (let ix = x0; ix <= x1; ix++) {
                    for (let iz = z0; iz <= z1; iz++) {
                        const k = ix + '|' + iz;
                        let a = hash.get(k);
                        if (!a) hash.set(k, a = []);
                        a.push(col);
                    }
                }
            }
            const valid = new Uint8Array(nodes.length);
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                const arr = hash.get(Math.floor(n.x / CELL) + '|' + Math.floor(n.z / CELL));
                let blocked = false;
                if (arr) {
                    for (let c = 0; c < arr.length; c++) {
                        const col = arr[c];
                        if (Math.abs(n.x - col.x) < col.sx / 2 + 0.3 && Math.abs(n.z - col.z) < col.sz / 2 + 0.3) {
                            blocked = true;
                            break;
                        }
                    }
                }
                if (!blocked) valid[i] = 1;
            }
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (!valid[i]) { n.nbrs = []; n.xw = []; continue; }
                const nb = [], xw = [];
                for (let k = 0; k < n.nbrs.length; k++) {
                    if (!valid[n.nbrs[k]]) continue;
                    nb.push(n.nbrs[k]);
                    xw.push(n.xw ? n.xw[k] : null);
                }
                n.nbrs = nb; n.xw = xw;
            }
            this.map.finalizeSidewalk();
        }

        _buildChunkMesh(c) {
            const group = new THREE.Group();
            if (c.flat.count() > 0) {
                const m = c.flat.buildMesh(this.mat.flat);
                m.receiveShadow = true;
                group.add(m);
            }
            for (const style in c.facades) {
                if (c.facades[style].count() <= 0) continue;
                const m = c.facades[style].buildMesh(this.mat[style]);
                m.castShadow = true;
                m.receiveShadow = true;
                group.add(m);
            }
            if (c.neon.count() > 0) group.add(c.neon.buildMesh(this.mat.basic));
            if (c.billboard.count() > 0) group.add(c.billboard.buildMesh(this.mat.billboard));
            group.userData.cx = c.i;
            group.userData.cz = c.j;
            this.root.add(group);
            (this.chunkGroups = this.chunkGroups || []).push(group);
            // Free the raw batches — geometry now lives on the GPU.
            c.flat = null; c.facades = null; c.neon = null; c.billboard = null;
        }
    }
