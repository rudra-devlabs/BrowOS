    // ===========================================================================
    // PARTICLES — additive sparks + solid debris, one pool each
    // ===========================================================================
    const PARTICLE_KINDS = {
        // kind: [pool, count, speed, life, size, grav, r, g, b]
        spark: ['glow', 10, 7, 0.35, 0.5, -14, 1.0, 0.85, 0.4],
        muzzle: ['glow', 4, 2, 0.12, 0.8, 0, 1.0, 0.9, 0.55],
        blood: ['chunk', 9, 4.5, 0.5, 0.09, -16, 0.55, 0.1, 0.1],
        debris: ['chunk', 8, 5, 0.7, 0.1, -14, 0.45, 0.42, 0.38],
        splash: ['glow', 8, 4, 0.5, 0.3, -10, 0.6, 0.8, 0.95],
        foam: ['glow', 10, 1.8, 0.9, 0.55, 2, 0.82, 0.92, 0.96],
        smoke: ['chunk', 1, 0.8, 1.8, 0.35, 0.7, 0.35, 0.35, 0.38],
        tireSmoke: ['glow', 2, 1.2, 0.55, 0.4, 0.3, 0.88, 0.88, 0.92],
        cash: ['glow', 6, 3, 0.5, 0.3, -4, 0.5, 0.95, 0.55],
        boom: ['glow', 16, 9, 0.6, 0.9, -4, 1.0, 0.55, 0.2],
    };

    class ParticleSystem {
        constructor(scene, mat) {
            this.count = 224;
            const quad = new THREE.PlaneGeometry(1, 1);
            const box = new THREE.BoxGeometry(0.14, 0.14, 0.14);
            this.glow = new THREE.InstancedMesh(quad, mat.glow, this.count);
            this.chunk = new THREE.InstancedMesh(box, mat.basic, this.count);
            for (const m of [this.glow, this.chunk]) {
                if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                m.frustumCulled = false;
                scene.add(m);
            }
            this._dummy = new THREE.Object3D();
            this._col = new THREE.Color();
            // Slot data: 0 = glow pool, 1 = chunk pool.
            this.slots = [new Array(this.count), new Array(this.count)];
            for (const arr of this.slots) {
                for (let i = 0; i < arr.length; i++) arr[i] = { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, drag: 0 };
            }
            this._hide(this.glow); this._hide(this.chunk);
        }

        _hide(mesh) {
            const d = this._dummy;
            d.position.set(0, -500, 0); d.rotation.set(0, 0, 0); d.scale.set(0.001, 0.001, 0.001);
            d.updateMatrix();
            for (let i = 0; i < this.count; i++) mesh.setMatrixAt(i, d.matrix);
            mesh.instanceMatrix.needsUpdate = true;
        }

        /** Spawn one particle manually. */
        _emit(poolName, x, y, z, vx, vy, vz, life, size, grow, r, g, b, drag) {
            const pool = poolName === 'glow' ? 0 : 1;
            const arr = this.slots[pool];
            for (let i = 0; i < arr.length; i++) {
                const s = arr[i];
                if (s.on) continue;
                s.on = true;
                s.x = x; s.y = y; s.z = z;
                s.vx = vx; s.vy = vy; s.vz = vz;
                s.life = 0; s.max = life; s.size = size; s.grow = grow;
                s.r = r; s.g = g; s.b = b; s.drag = drag || 0;
                return;
            }
        }

        /** Emit a named burst (see PARTICLE_KINDS). */
        burst(kind, x, y, z, scale) {
            const k = PARTICLE_KINDS[kind];
            if (!k) return;
            scale = scale || 1;
            const [pool, n, speed, life, size, grav, r, g, b] = k;
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const up = Math.random();
                const sp = speed * (0.5 + Math.random() * 0.7) * scale;
                this._emit(pool, x, y, z,
                    Math.cos(a) * sp * (1 - up * 0.6),
                    up * sp * 0.9 + speed * 0.15,
                    Math.sin(a) * sp * (1 - up * 0.6),
                    life * (0.7 + Math.random() * 0.6),
                    size * (0.7 + Math.random() * 0.6), grav < 0 ? 0 : 0.8, // grow drifting smoke
                    r * (0.85 + Math.random() * 0.3), g * (0.85 + Math.random() * 0.3), b * (0.85 + Math.random() * 0.3),
                    kind === 'smoke' ? 1.4 : 0.4);
            }
        }

        update(dt, camera) {
            const d = this._dummy;
            for (let pool = 0; pool < 2; pool++) {
                const mesh = pool === 0 ? this.glow : this.chunk;
                const arr = this.slots[pool];
                for (let i = 0; i < arr.length; i++) {
                    const s = arr[i];
                    if (!s.on) continue;
                    s.life += dt;
                    if (s.life >= s.max) {
                        s.on = false;
                        d.position.set(0, -500, 0); d.scale.set(0.001, 0.001, 0.001);
                        d.updateMatrix();
                        mesh.setMatrixAt(i, d.matrix);
                        continue;
                    }
                    // Drifting particles (smoke) rise; the rest fall.
                    if (s.grow > 0) { s.vy += 0.5 * dt; }
                    else { s.vy -= 14 * dt; if (s.y < 0.12 && s.vy < 0) { s.vy = 0; s.vx *= 0.6; s.vz *= 0.6; } }
                    const dr = Math.max(0, 1 - s.drag * dt);
                    s.vx *= dr; s.vz *= dr;
                    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
                    const f = 1 - s.life / s.max;
                    const size = s.size * (s.grow > 0 ? (1 + (1 - f) * s.grow) : f);
                    if (pool === 0) {
                        // Billboard toward the camera.
                        d.position.set(s.x, s.y, s.z);
                        d.quaternion.copy(camera ? camera.quaternion : this._dummy.quaternion);
                        d.scale.set(size, size, 1);
                    } else {
                        d.position.set(s.x, s.y, s.z);
                        d.rotation.set(s.life * 4, s.life * 3, 0);
                        d.scale.set(size / 0.14, size / 0.14, size / 0.14);
                    }
                    d.updateMatrix();
                    mesh.setMatrixAt(i, d.matrix);
                    this._col.setRGB(s.r, s.g, s.b);
                    mesh.setColorAt(i, this._col);
                }
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            }
        }

        clear() {
            for (const arr of this.slots) for (const s of arr) s.on = false;
        }
    }
