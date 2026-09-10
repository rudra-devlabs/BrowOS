    // ===========================================================================
    // LOOT — glowing walk-over pickups dropped by fallen peds
    // ===========================================================================
    const LOOT_DEFS = {
        cash: { pool: 18, halo: [0.35, 0.9, 0.45], y: 0.32 },
        health: { pool: 6, halo: [0.95, 0.3, 0.3], y: 0.36 },
        armor: { pool: 6, halo: [0.35, 0.55, 0.95], y: 0.36 },
        ammo: { pool: 6, halo: [0.9, 0.8, 0.35], y: 0.3 },
        pistol: { pool: 4, halo: [0.95, 0.75, 0.3], y: 0.34 },
        bag: { pool: 4, halo: [0.9, 0.65, 0.25], y: 0.36 },
    };

    const LootFactory = {
        geo: null,
        build() {
            if (this.geo) return this.geo;
            const mk = (fn) => { const b = new GeoBatch(); fn(b); return b.buildGeometry(); };
            this.geo = {
                // Cash: three stacked bills with a band.
                cash: mk((b) => {
                    b.box(0, 0.02, 0, 0.34, 0.035, 0.2, [0.35, 0.62, 0.4]);
                    b.box(0.015, 0.055, 0.01, 0.34, 0.035, 0.2, [0.4, 0.7, 0.45]);
                    b.box(-0.01, 0.09, -0.01, 0.34, 0.035, 0.2, [0.32, 0.58, 0.38]);
                    b.box(0, 0.055, 0, 0.1, 0.1, 0.06, [0.85, 0.82, 0.6]);
                }),
                // Health kit: white box, red cross.
                health: mk((b) => {
                    b.box(0, 0.14, 0, 0.3, 0.24, 0.22, [0.92, 0.9, 0.86]);
                    b.box(0, 0.15, 0.115, 0.16, 0.05, 0.01, [0.85, 0.2, 0.2]);
                    b.box(0, 0.15, 0.115, 0.05, 0.15, 0.01, [0.85, 0.2, 0.2]);
                    b.box(0, 0.27, 0, 0.12, 0.03, 0.06, [0.4, 0.4, 0.45]); // handle
                }),
                // Armor vest: blue plate + collar.
                armor: mk((b) => {
                    b.box(0, 0.16, 0, 0.34, 0.3, 0.14, [0.3, 0.42, 0.72]);
                    b.box(0, 0.33, 0, 0.2, 0.06, 0.12, [0.24, 0.34, 0.6]);
                    b.box(0, 0.16, 0.075, 0.26, 0.18, 0.015, [0.45, 0.58, 0.85]);
                }),
                // Ammo box: dark crate with brass tips.
                ammo: mk((b) => {
                    b.box(0, 0.1, 0, 0.26, 0.18, 0.18, [0.35, 0.32, 0.26]);
                    b.box(0, 0.2, 0, 0.28, 0.03, 0.2, [0.5, 0.46, 0.36]);
                    b.box(-0.05, 0.235, -0.03, 0.03, 0.05, 0.03, [0.85, 0.7, 0.3]);
                    b.box(0.05, 0.235, 0.03, 0.03, 0.05, 0.03, [0.85, 0.7, 0.3]);
                }),
                // Pistol: slide + grip.
                pistol: mk((b) => {
                    b.box(0, 0.1, 0, 0.06, 0.09, 0.3, [0.18, 0.18, 0.2]);
                    b.box(0, 0.02, -0.09, 0.055, 0.13, 0.08, [0.32, 0.24, 0.16]);
                }),
                // Cash bag: duffel with buckles.
                bag: mk((b) => {
                    b.box(0, 0.13, 0, 0.36, 0.24, 0.2, [0.45, 0.35, 0.24]);
                    b.box(0, 0.26, 0, 0.3, 0.04, 0.16, [0.3, 0.24, 0.16]);
                    b.box(-0.09, 0.28, 0, 0.05, 0.05, 0.05, [0.85, 0.7, 0.3]);
                    b.box(0.09, 0.28, 0, 0.05, 0.05, 0.05, [0.85, 0.7, 0.3]);
                }),
            };
            return this.geo;
        },
    };

    /**
     * Pickup pool: spinning glowing items with magnet + collect radii.
     * Drop table per design: 90% cash ($20-150), 8% item, 2% rare.
     */
    class LootSystem {
        constructor(scene, mat) {
            const geo = LootFactory.build();
            this.meshes = {};
            this.free = {};
            this.items = [];
            const mk = (type) => {
                const def = LOOT_DEFS[type];
                const m = new THREE.InstancedMesh(geo[type], mat.basic, def.pool);
                if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                m.frustumCulled = false;
                scene.add(m);
                this.meshes[type] = m;
                this.free[type] = [];
                for (let i = def.pool - 1; i >= 0; i--) this.free[type].push(i);
                // Park them far away until used.
                const d = new THREE.Object3D();
                d.position.set(0, -500, 0); d.scale.set(0.001, 0.001, 0.001); d.updateMatrix();
                for (let i = 0; i < def.pool; i++) m.setMatrixAt(i, d.matrix);
                m.instanceMatrix.needsUpdate = true;
            };
            for (const type in LOOT_DEFS) mk(type);
            // Ground halos (glow quads lying flat).
            const total = Object.keys(LOOT_DEFS).reduce((a, t) => a + LOOT_DEFS[t].pool, 0);
            this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat.glow, total);
            if (this.halo.instanceMatrix.setUsage) this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.halo.frustumCulled = false;
            scene.add(this.halo);
            this._dummy = new THREE.Object3D();
            this._col = new THREE.Color();
            for (let i = 0; i < total; i++) {
                this._dummy.position.set(0, -500, 0);
                this._dummy.rotation.set(-Math.PI / 2, 0, 0);
                this._dummy.scale.set(0.001, 0.001, 0.001);
                this._dummy.updateMatrix();
                this.halo.setMatrixAt(i, this._dummy.matrix);
                this._col.setRGB(1, 1, 1);
                this.halo.setColorAt(i, this._col);
            }
            this.halo.instanceMatrix.needsUpdate = true;
            if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
            this._haloOfs = {};
            let off = 0;
            for (const type in LOOT_DEFS) { this._haloOfs[type] = off; off += LOOT_DEFS[type].pool; }
        }

        /** Roll the drop table and spawn a pickup. */
        drop(x, z, rng, forced, amtOverride) {
            rng = rng || Math.random;
            let type, amount = 0;
            if (forced) {
                type = forced;
            } else {
                const r = rng();
                if (r < 0.9) type = 'cash';
                else if (r < 0.98) type = pick(['health', 'armor', 'ammo'], rng);
                else type = rng() < 0.6 ? 'pistol' : 'bag';
            }
            if (type === 'cash') amount = amtOverride != null ? amtOverride : 20 + ((rng() * 27) | 0) * 5; // $20-150
            if (type === 'bag') amount = 500;
            if (type === 'ammo') amount = 12;
            if (!this.free[type] || !this.free[type].length) return null;
            const idx = this.free[type].pop();
            const item = {
                type, idx, amount, x, z, y: 0, t: 0,
                haloIdx: this._haloOfs[type] + idx,
            };
            this.items.push(item);
            this._col.setRGB(LOOT_DEFS[type].halo[0], LOOT_DEFS[type].halo[1], LOOT_DEFS[type].halo[2]);
            this.halo.setColorAt(item.haloIdx, this._col);
            if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
            return item;
        }

        update(dt, time, player, physics, fx) {
            const d = this._dummy;
            for (let i = this.items.length - 1; i >= 0; i--) {
                const it = this.items[i];
                it.t += dt;
                if (it.t > 25) { this.remove(it); continue; }
                // Magnet + collect toward the player.
                const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < 1.4 * 1.4) {
                    const dd = Math.sqrt(d2) || 1;
                    it.x += (dx / dd) * 6 * dt;
                    it.z += (dz / dd) * 6 * dt;
                }
                if (d2 < 0.45 * 0.45) {
                    if (fx) fx.lootCollected(it.type, it.amount);
                    this.remove(it);
                    continue;
                }
                it.y = physics.groundAt(it.x, it.z, it.y + 0.6, 0.8, this._q || (this._q = []));
                const def = LOOT_DEFS[it.type];
                const bobY = it.y + def.y + Math.sin(time * 3 + it.haloIdx) * 0.05;
                // Body: spin + bob.
                d.position.set(it.x, bobY, it.z);
                d.rotation.set(0, time * 1.8 + it.haloIdx, 0);
                d.scale.set(1, 1, 1);
                d.updateMatrix();
                this.meshes[it.type].setMatrixAt(it.idx, d.matrix);
                this.meshes[it.type].instanceMatrix.needsUpdate = true;
                // Halo: flat glow, pulsing.
                const hs = 0.85 + Math.sin(time * 4 + it.haloIdx) * 0.12;
                d.position.set(it.x, it.y + 0.06, it.z);
                d.rotation.set(-Math.PI / 2, 0, time * 0.7);
                d.scale.set(hs, hs, 1);
                d.updateMatrix();
                this.halo.setMatrixAt(it.haloIdx, d.matrix);
                this.halo.instanceMatrix.needsUpdate = true;
            }
        }

        remove(it) {
            const i = this.items.indexOf(it);
            if (i !== -1) this.items.splice(i, 1);
            this.free[it.type].push(it.idx);
            const d = this._dummy;
            d.position.set(0, -500, 0);
            d.scale.set(0.001, 0.001, 0.001);
            d.updateMatrix();
            this.meshes[it.type].setMatrixAt(it.idx, d.matrix);
            this.meshes[it.type].instanceMatrix.needsUpdate = true;
            this.halo.setMatrixAt(it.haloIdx, d.matrix);
            this.halo.instanceMatrix.needsUpdate = true;
        }

        clear() {
            for (let i = this.items.length - 1; i >= 0; i--) this.remove(this.items[i]);
        }
    }
