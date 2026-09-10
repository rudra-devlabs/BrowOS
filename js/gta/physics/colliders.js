    // ===========================================================================
    // COLLIDERS — Universal Trimesh BVH + spatial hash + circle/ray/ground queries
    // ===========================================================================
    (function () {
        const lib = (typeof window !== 'undefined' && window.MeshBVHLib) || (typeof MeshBVHLib !== 'undefined' ? MeshBVHLib : null);
        if (lib && typeof THREE !== 'undefined') {
            if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
                THREE.BufferGeometry.prototype.computeBoundsTree = lib.computeBoundsTree;
                THREE.BufferGeometry.prototype.disposeBoundsTree = lib.disposeBoundsTree;
                THREE.Mesh.prototype.raycast = lib.acceleratedRaycast;
            }
        }
    })();

    /**
     * Universal Trimesh BVH Physics Engine with Spatial Hash Broadphase.
     * Collides directly against the 3D rendered geometry of visible static meshes (buildings,
     * terrain, roads, bridges, stairs, props), with zero cuboidal box bulging.
     * Water meshes are strictly excluded from collision.
     */
    class PhysicsWorld {
        constructor(colliders, root, builder) {
            this.cell = 16;
            this.meshCell = 48;
            this.colliders = colliders || [];
            this.root = root || null;
            this.builder = builder || null;
            this.wasmWorld = null;
            this.grid = null;
            this.meshGrid = new Map();
            this.indexedMeshes = [];

            const lib = (typeof window !== 'undefined' && window.MeshBVHLib) || (typeof MeshBVHLib !== 'undefined' ? MeshBVHLib : null);
            this.MeshBVH = lib ? lib.MeshBVH : null;
            this.ExtendedTriangle = lib ? lib.ExtendedTriangle : null;
            this._tempTri = this.ExtendedTriangle ? new this.ExtendedTriangle() : null;
            this._tempT1 = new THREE.Vector3();
            this._tempT2 = new THREE.Vector3();
            this._tempSeg = new THREE.Line3();
            this._tempBox = new THREE.Box3();
            this._tempRay = new THREE.Ray();
            this._tempRayLocal = new THREE.Ray();
            this._tempPush = new THREE.Vector3();
            this._tempPushWorld = new THREE.Vector3();
            this._tempPushLocal = new THREE.Vector3();
            this._tempHitPoint = new THREE.Vector3();
            this._tempVec = new THREE.Vector3();
            this._candMesh = [];
            this._candBoxes = [];

            if (this.root) {
                this.indexMeshes(this.root, this.builder);
            }
            this.rebuild(true);
        }

        /**
         * Index all visible static meshes from the city builder hierarchy.
         * Automatically builds BVH bounding trees on visual geometries and buckets them.
         * STRICT EXCLUSION: Water surfaces never collide!
         */
        indexMeshes(root, builder) {
            this.root = root || this.root;
            this.builder = builder || this.builder;
            if (!this.root) return;

            const lib = (typeof window !== 'undefined' && window.MeshBVHLib) || (typeof MeshBVHLib !== 'undefined' ? MeshBVHLib : null);
            if (!lib) {
                console.warn('[BrowCity Physics] MeshBVHLib not found, falling back to box colliders.');
                return;
            }

            this.meshGrid.clear();
            this.indexedMeshes.length = 0;

            this.root.updateMatrixWorld(true);

            const b = this.builder;
            let totalTris = 0;

            this.root.traverseVisible((mesh) => {
                if (!mesh.isMesh || !mesh.geometry) return;
                // Animated villa gate wings: owned by VillaGateSystem (they
                // move every frame, so a build-time BVH snapshot would be
                // stale). Skipped here; the gate does its own push-out.
                if (mesh.userData && mesh.userData.villaGate) return;

                // 1. Water Exclusion: Sea plane, Central Park reservoir & lake, river channel
                const mat = mesh.material;
                const matName = mat ? (mat.name || '') : '';
                const isWater = /water/i.test(mesh.name) || /water/i.test(matName) ||
                                (b && b.mat && (mat === b.mat.water || mat === b.mat.parkWater));
                if (isWater) return; // STRICT EXCLUSION: Water NEVER collides!

                // 2. Compute or reuse geometry BVH
                if (!mesh.geometry.boundsTree) {
                    try {
                        mesh.geometry.computeBoundsTree = lib.computeBoundsTree;
                        mesh.geometry.computeBoundsTree();
                    } catch (err) {
                        return;
                    }
                }
                if (!mesh.geometry.boundsTree) return;

                // 3. Compute world space bounding box and inverse world matrix
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                mesh.updateMatrixWorld(true);

                const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
                const worldBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);

                const count = mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count : 0;
                totalTris += mesh.geometry.index ? mesh.geometry.index.count / 3 : count / 3;

                const record = {
                    mesh,
                    invMat,
                    worldBox,
                    boundsTree: mesh.geometry.boundsTree,
                    name: mesh.name || (mat ? mat.name : 'mesh')
                };
                this.indexedMeshes.push(record);

                // 4. Register in spatial broadphase grid
                const x0 = Math.floor(worldBox.min.x / this.meshCell);
                const x1 = Math.floor(worldBox.max.x / this.meshCell);
                const z0 = Math.floor(worldBox.min.z / this.meshCell);
                const z1 = Math.floor(worldBox.max.z / this.meshCell);
                for (let gx = x0; gx <= x1; gx++) {
                    for (let gz = z0; gz <= z1; gz++) {
                        const key = gx * 100000 + gz;
                        let bucket = this.meshGrid.get(key);
                        if (!bucket) { bucket = []; this.meshGrid.set(key, bucket); }
                        bucket.push(record);
                    }
                }
            });

            console.log(`[BrowCity Physics] Universal Trimesh BVH active: ${this.indexedMeshes.length} meshes indexed (${Math.round(totalTris)} triangles). Water strictly excluded.`);
        }

        /** Query candidate BVH meshes near (x, z) with radius r. */
        queryMeshes(x, z, r, out) {
            out.length = 0;
            const x0 = Math.floor((x - r) / this.meshCell), x1 = Math.floor((x + r) / this.meshCell);
            const z0 = Math.floor((z - r) / this.meshCell), z1 = Math.floor((z + r) / this.meshCell);
            for (let gx = x0; gx <= x1; gx++) {
                for (let gz = z0; gz <= z1; gz++) {
                    const bucket = this.meshGrid.get(gx * 100000 + gz);
                    if (!bucket) continue;
                    for (let k = 0; k < bucket.length; k++) {
                        const rec = bucket[k];
                        if (out.indexOf(rec) === -1) out.push(rec);
                    }
                }
            }
            return out;
        }

        /** (Re)index legacy boxes for fallback / map editor support. */
        rebuild(first) {
            const colliders = this.colliders;
            const wasmEnabled = typeof window !== 'undefined' &&
                (!window.BrowSettings || window.BrowSettings.get('wasmAcceleration') !== false);
            if (wasmEnabled && typeof window !== 'undefined' && window.BrowPhysicsWasm && typeof window.BrowPhysicsWasm.createWorld === 'function') {
                const envelopes = colliders.map(c => {
                    if (c.yaw) {
                        const cos = Math.abs(Math.cos(c.yaw)), sin = Math.abs(Math.sin(c.yaw));
                        return {
                            x: c.x, y: c.y, z: c.z,
                            sx: cos * c.sx + sin * c.sz,
                            sy: c.sy,
                            sz: sin * c.sx + cos * c.sz
                        };
                    }
                    return c;
                });
                this.wasmWorld = window.BrowPhysicsWasm.createWorld(envelopes, this.cell);
            } else {
                this.wasmWorld = null;
            }

            if (this.grid) this.grid.clear(); else this.grid = new Map();
            for (let i = 0; i < colliders.length; i++) {
                const c = colliders[i];
                let hx = c.sx / 2, hz = c.sz / 2;
                if (c.yaw) {
                    const cos = Math.abs(Math.cos(c.yaw)), sin = Math.abs(Math.sin(c.yaw));
                    hx = (cos * c.sx + sin * c.sz) / 2;
                    hz = (sin * c.sx + cos * c.sz) / 2;
                }
                const x0 = Math.floor((c.x - hx) / this.cell), x1 = Math.floor((c.x + hx) / this.cell);
                const z0 = Math.floor((c.z - hz) / this.cell), z1 = Math.floor((c.z + hz) / this.cell);
                for (let gx = x0; gx <= x1; gx++) {
                    for (let gz = z0; gz <= z1; gz++) {
                        const key = gx * 100000 + gz;
                        let bucket = this.grid.get(key);
                        if (!bucket) { bucket = []; this.grid.set(key, bucket); }
                        bucket.push(i);
                    }
                }
            }
        }

        /** Candidate collider indices near a circle (x, z, radius). */
        queryCircle(x, z, r, out) {
            if (this.wasmWorld) {
                return this.wasmWorld.queryCircle(x, z, r, out);
            }
            out.length = 0;
            const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
            const z0 = Math.floor((z - r) / this.cell), z1 = Math.floor((z + r) / this.cell);
            for (let gx = x0; gx <= x1; gx++) {
                for (let gz = z0; gz <= z1; gz++) {
                    const bucket = this.grid.get(gx * 100000 + gz);
                    if (!bucket) continue;
                    for (let k = 0; k < bucket.length; k++) {
                        if (out.indexOf(bucket[k]) === -1) out.push(bucket[k]);
                    }
                }
            }
            return out;
        }

        /**
         * Universal Trimesh Cylinder Collision Resolution.
         * Resolves penetration against actual visual mesh triangles (walls, railings, fences,
         * cliffs, pillars) using BVH shapecast. Eliminates cuboidal bulging completely.
         */
        resolveCircle(pos, r, yBottom, yTop, out) {
            let deepest = null, deepestPen = 0;
            let hitTrimesh = false;

            // 1. BVH Trimesh Collision against all visible static meshes
            if (this.indexedMeshes.length > 0 && this._tempTri) {
                const cands = this.queryMeshes(pos.x, pos.z, r + 0.6, this._candMesh);
                const tri = this._tempTri;
                const t1 = this._tempT1, t2 = this._tempT2;

                for (let i = 0; i < cands.length; i++) {
                    const rec = cands[i];
                    if (rec.mesh.visible === false || !rec.mesh.parent) continue;

                    const wb = rec.worldBox;
                    if (pos.x + r < wb.min.x || pos.x - r > wb.max.x) continue;
                    if (pos.z + r < wb.min.z || pos.z - r > wb.max.z) continue;
                    if (wb.max.y < yBottom || wb.min.y > yTop) continue;

                    const pStart = this._tempVec.set(pos.x, yBottom, pos.z).applyMatrix4(rec.invMat);
                    const pEnd = this._tempPush.set(pos.x, yTop, pos.z).applyMatrix4(rec.invMat);
                    this._tempSeg.start.copy(pStart);
                    this._tempSeg.end.copy(pEnd);
                    this._tempBox.setFromPoints([pStart, pEnd]).expandByScalar(r + 0.05);

                    let hitMesh = false;
                    let localDeepest = 0;
                    const pushLocal = this._tempPushLocal.set(0, 0, 0);

                    rec.boundsTree.shapecast({
                        intersectsBounds: b => b.intersectsBox(this._tempBox),
                        intersectsTriangle: (triangle) => {
                            tri.copy(triangle);
                            const norm = this._tempPush;
                            tri.getNormal(norm);
                            const ny = norm.y;
                            if (Math.abs(ny) > 0.60) return; // Walkable slopes, ramps, and flat surfaces (< 53 deg)

                            const dist = tri.closestPointToSegment(this._tempSeg, t1, t2);
                            if (dist < r) {
                                // Enforce vertical cylinder bounds: prevent capsule spherical cap from penetrating road/curbs/bumps
                                const worldT1Y = this._tempHitPoint.copy(t1).applyMatrix4(rec.mesh.matrixWorld).y;
                                if (worldT1Y < yBottom || worldT1Y > yTop) return;

                                const pen = r - dist;
                                if (pen > localDeepest) {
                                    localDeepest = pen;
                                    hitMesh = true;
                                    // t1 is the closest point on the obstacle triangle.
                                    // t2 is the closest point on the character/vehicle cylinder segment.
                                    // Push vector must push OUT of the obstacle: t2 - t1 (away from triangle).
                                    pushLocal.subVectors(t2, t1);
                                    pushLocal.y = 0;
                                    const len = pushLocal.length();
                                    if (len > 1e-6) {
                                        pushLocal.multiplyScalar(pen / len);
                                    } else {
                                        pushLocal.set(norm.x, 0, norm.z).normalize().multiplyScalar(pen);
                                    }
                                }
                            }
                        }
                    });

                    if (hitMesh && localDeepest > 0) {
                        hitTrimesh = true;
                        const pushWorld = this._tempPushWorld.copy(pushLocal).transformDirection(rec.mesh.matrixWorld);
                        pushWorld.y = 0;
                        if (pushWorld.lengthSq() > 1e-8) {
                            pushWorld.normalize().multiplyScalar(localDeepest);
                            pos.x += pushWorld.x;
                            pos.z += pushWorld.z;
                        }
                        if (localDeepest > deepestPen) {
                            deepestPen = localDeepest;
                            deepest = rec;
                        }
                    }
                }
            }

            // 2. Dynamic Box Colliders & Custom Minecraft Blocks
            if (this.colliders && this.colliders.length > 0) {
                const boxOut = out || this._candBoxes;
                for (let iter = 0; iter < 2; iter++) {
                    this.queryCircle(pos.x, pos.z, r + 0.6, boxOut);
                    for (let idx = 0; idx < boxOut.length; idx++) {
                        const i = boxOut[idx];
                        const c = this.colliders[i];
                        if (!c) continue;
                        if (c.tag === 'mc_ramp') continue; // ramps guide vertical elevation, don't block entry
                        if (c.mesh && (c.mesh.visible === false || !c.mesh.parent)) continue;
                        if (c.y + c.sy / 2 <= yBottom + 0.02 || c.y - c.sy / 2 >= yTop) continue;

                        let px, pz, dx, dz;
                        if (c.yaw) {
                            dx = pos.x - c.x; dz = pos.z - c.z;
                            const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
                            const lx = dx * cos - dz * sin;
                            const lz = dx * sin + dz * cos;
                            px = c.sx / 2 + r - Math.abs(lx);
                            pz = c.sz / 2 + r - Math.abs(lz);
                            if (px <= 0 || pz <= 0) continue;
                            let ux = 0, uz = 0;
                            if (px < pz) ux = lx >= 0 ? px : -px;
                            else uz = lz >= 0 ? pz : -pz;
                            pos.x += ux * cos + uz * sin;
                            pos.z += -ux * sin + uz * cos;
                        } else {
                            dx = pos.x - c.x; dz = pos.z - c.z;
                            px = c.sx / 2 + r - Math.abs(dx);
                            pz = c.sz / 2 + r - Math.abs(dz);
                            if (px <= 0 || pz <= 0) continue;
                            if (px < pz) pos.x += dx >= 0 ? px : -px;
                            else pos.z += dz >= 0 ? pz : -pz;
                        }
                        const pen = Math.min(px, pz);
                        if (pen > deepestPen) { deepestPen = pen; deepest = c; }
                    }
                }
            }

            return deepest;
        }

        /**
         * Universal Trimesh Ground Elevation Query.
         * Downward raycast directly against rendered mesh geometry (roads, ramps, bridge decks,
         * curbs, stairs, hills, rooftops). Returns exact surface height.
         */
        groundAt(x, z, fromY, step, out) {
            let best = null;

            // 1. BVH Downward Raycast against all visible static meshes
            if (this.indexedMeshes.length > 0) {
                const cands = this.queryMeshes(x, z, 0.2, this._candMesh);
                this._tempRay.origin.set(x, fromY + step, z);
                this._tempRay.direction.set(0, -1, 0);

                for (let i = 0; i < cands.length; i++) {
                    const rec = cands[i];
                    if (rec.mesh.visible === false || !rec.mesh.parent) continue;

                    const wb = rec.worldBox;
                    if (x < wb.min.x - 0.05 || x > wb.max.x + 0.05) continue;
                    if (z < wb.min.z - 0.05 || z > wb.max.z + 0.05) continue;
                    if (wb.min.y > fromY + step + 0.05) continue;

                    this._tempRayLocal.copy(this._tempRay).applyMatrix4(rec.invMat);
                    const hit = rec.boundsTree.raycastFirst(this._tempRayLocal, THREE.DoubleSide);
                    if (hit) {
                        const worldHitY = this._tempHitPoint.copy(hit.point).applyMatrix4(rec.mesh.matrixWorld).y;
                        if (worldHitY <= fromY + step + 0.02) {
                            if (best === null || worldHitY > best) {
                                best = worldHitY;
                            }
                        }
                    }
                }
            }

            // 2. Legacy Bridge Deck & Box Fallback
            const deck = bridgeDeckY(x, z);
            if (deck >= 0 && deck <= fromY + step && (best === null || deck > best)) {
                best = deck;
            }

            if (this.colliders && this.colliders.length > 0) {
                const boxOut = out || this._candBoxes;
                this.queryCircle(x, z, 0.1, boxOut);
                for (let idx = 0; idx < boxOut.length; idx++) {
                    const i = boxOut[idx];
                    const c = this.colliders[i];
                    if (!c) continue;
                    if (c.mesh && (c.mesh.visible === false || !c.mesh.parent)) continue;

                    if (c.yaw) {
                        const dx = x - c.x, dz = z - c.z;
                        const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
                        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
                        if (Math.abs(lx) > c.sx / 2 || Math.abs(lz) > c.sz / 2) continue;
                    } else {
                        if (x < c.x - c.sx / 2 || x > c.x + c.sx / 2) continue;
                        if (z < c.z - c.sz / 2 || z > c.z + c.sz / 2) continue;
                    }
                    let top = c.y + c.sy / 2;
                    if (c.tag === 'mc_ramp') {
                        const dx = x - c.x, dz = z - c.z;
                        const cos = Math.cos(c.yaw || 0), sin = Math.sin(c.yaw || 0);
                        const lz = dx * sin + dz * cos;
                        const u = Math.max(0, Math.min(1, (lz + c.sz / 2) / c.sz));
                        top = (c.y - c.sy / 2) + u * c.sy;
                    }
                    if (top <= fromY + step && (best === null || top > best)) best = top;
                }
            }

            // 3. True Surface Return
            // If we found a real 3D mesh surface, bridge deck, or box collider, return it directly!
            if (best !== null) {
                return best;
            }

            // 4. Terrain & Land Mask Fallback (only when no 3D mesh was hit)
            const hillY = typeof getTerrainElevation === 'function' ? getTerrainElevation(x, z) : 0.12;
            const land = (typeof LandMask !== 'undefined' && LandMask.inside && LandMask.inside(x, z)) ? hillY : -0.35;
            return land;
        }

        /**
         * Ray vs static meshes (BVH) and static boxes. Returns
         * { dist, point:[x,y,z], collider } or null. Used for gunfire.
         */
        raycast(ox, oy, oz, dx, dy, dz, maxDist, out, ignoreCol) {
            let bestT = maxDist, bestPoint = null, bestC = null;

            // 1. Raycast against BVH meshes
            if (this.indexedMeshes.length > 0) {
                this._tempRay.origin.set(ox, oy, oz);
                this._tempRay.direction.set(dx, dy, dz).normalize();

                for (let i = 0; i < this.indexedMeshes.length; i++) {
                    const rec = this.indexedMeshes[i];
                    if (rec.mesh.visible === false || !rec.mesh.parent) continue;

                    this._tempRayLocal.copy(this._tempRay).applyMatrix4(rec.invMat);
                    const hit = rec.boundsTree.raycastFirst(this._tempRayLocal, THREE.DoubleSide);
                    if (hit) {
                        const worldHit = hit.point.clone().applyMatrix4(rec.mesh.matrixWorld);
                        const dist = Math.hypot(worldHit.x - ox, worldHit.y - oy, worldHit.z - oz);
                        if (dist < bestT) {
                            bestT = dist;
                            bestPoint = [worldHit.x, worldHit.y, worldHit.z];
                            bestC = rec.mesh;
                        }
                    }
                }
            }

            // 2. Legacy box raycast fallback
            if (this.colliders && this.colliders.length > 0) {
                const stepLen = 8;
                const seen = out || this._candBoxes;
                seen.length = 0;
                const steps = Math.ceil(maxDist / stepLen);
                for (let s = 0; s <= steps; s++) {
                    const t = Math.min(s * stepLen, maxDist);
                    const qx = ox + dx * t, qz = oz + dz * t;
                    this.queryCircle(qx, qz, stepLen, seen);
                    for (let k = 0; k < seen.length; k++) {
                        const i = seen[k];
                        const c = this.colliders[i];
                        if (c === ignoreCol) continue;
                        if (c.mesh && (c.mesh.visible === false || !c.mesh.parent)) continue;

                        let hit = null;
                        if (c.yaw) {
                            const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
                            const lox = (ox - c.x) * cos - (oz - c.z) * sin;
                            const loy = oy - c.y;
                            const loz = (ox - c.x) * sin + (oz - c.z) * cos;
                            const ldx = dx * cos - dz * sin;
                            const ldy = dy;
                            const ldz = dx * sin + dz * cos;
                            hit = rayBox(lox, loy, loz, ldx, ldy, ldz, bestT,
                                -c.sx / 2, -c.sy / 2, -c.sz / 2,
                                c.sx / 2, c.sy / 2, c.sz / 2);
                        } else {
                            hit = rayBox(ox, oy, oz, dx, dy, dz, bestT,
                                c.x - c.sx / 2, c.y - c.sy / 2, c.z - c.sz / 2,
                                c.x + c.sx / 2, c.y + c.sy / 2, c.z + c.sz / 2);
                        }
                        if (hit !== null && hit < bestT) {
                            bestT = hit;
                            bestPoint = [ox + dx * hit, oy + dy * hit, oz + dz * hit];
                            bestC = c;
                        }
                    }
                    if (bestC) break;
                }
            }

            if (!bestC && dy < 0) {
                let gy = typeof getTerrainElevation === 'function' ? getTerrainElevation(ox, oz) : 0.1;
                for (let it = 0; it < 3; it++) {
                    const t = (gy - oy) / dy;
                    if (t <= 0 || t >= bestT) break;
                    const hx = ox + dx * t, hz = oz + dz * t;
                    const deck = bridgeDeckY(hx, hz);
                    const localGround = typeof getTerrainElevation === 'function' ? getTerrainElevation(hx, hz) : gy;
                    const targetY = deck > localGround ? deck : localGround;
                    if (targetY <= gy || targetY >= oy) {
                        return { dist: t, x: hx, y: gy, z: hz, collider: null };
                    }
                    gy = targetY;
                }
            }

            if (!bestC) return null;
            return {
                dist: bestT,
                x: bestPoint ? bestPoint[0] : ox + dx * bestT,
                y: bestPoint ? bestPoint[1] : oy + dy * bestT,
                z: bestPoint ? bestPoint[2] : oz + dz * bestT,
                collider: bestC,
            };
        }
    }

    /** Slab-method ray/AABB test; returns entry distance or null. */
    function rayBox(ox, oy, oz, dx, dy, dz, maxT, x0, y0, z0, x1, y1, z1) {
        let tmin = 0, tmax = maxT;
        if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; }
        else {
            let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx;
            if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }
        if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; }
        else {
            let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy;
            if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }
        if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return null; }
        else {
            let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz;
            if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
            if (tmin > tmax) return null;
        }
        return tmin;
    }
