    // ===========================================================================
    // BULLET TRACERS — 3D Supersonic projectile streaks & dynamic muzzle flash
    // ===========================================================================
    class BulletTracerSystem {
        constructor(scene) {
            this.scene = scene;
            this.maxTracers = 64;
            this.tracers = [];

            const maxVerts = this.maxTracers * 2;
            this.positions = new Float32Array(maxVerts * 3);
            this.colors = new Float32Array(maxVerts * 3);
            this.geo = new THREE.BufferGeometry();
            this.posAttr = new THREE.BufferAttribute(this.positions, 3);
            this.colAttr = new THREE.BufferAttribute(this.colors, 3);
            this.posAttr.setUsage(THREE.DynamicDrawUsage);
            this.colAttr.setUsage(THREE.DynamicDrawUsage);
            this.geo.setAttribute('position', this.posAttr);
            this.geo.setAttribute('color', this.colAttr);

            this.mat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                linewidth: 3
            });

            this.mesh = new THREE.LineSegments(this.geo, this.mat);
            this.mesh.frustumCulled = false;
            scene.add(this.mesh);

            // Dynamic PointLight for muzzle flash illumination
            this.flashLight = new THREE.PointLight(0xfff2aa, 0, 22, 1.6);
            this.flashLight.castShadow = false;
            scene.add(this.flashLight);
            this.flashT = 0;
        }

        spawn(x0, y0, z0, x1, y1, z1, weapon) {
            const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const speed = (weapon === 'rifle' ? 420 : (weapon === 'smg' ? 320 : (weapon === 'shotgun' ? 240 : 280)));
            const duration = Math.min(0.24, Math.max(0.08, dist / speed));
            const streakLen = Math.min(10.0, Math.max(2.5, dist * 0.45));

            let color = [1.0, 0.95, 0.65];
            if (weapon === 'shotgun') color = [1.0, 0.72, 0.35];
            else if (weapon === 'smg') color = [0.95, 0.9, 0.6];
            else if (weapon === 'rifle') color = [1.0, 0.85, 0.38];

            this.tracers.push({
                x0, y0, z0, x1, y1, z1,
                dx: dx / dist, dy: dy / dist, dz: dz / dist,
                dist,
                streakLen,
                life: 0,
                duration,
                color
            });

            if (this.tracers.length > this.maxTracers) {
                this.tracers.shift();
            }

            // Flash light at muzzle
            this.flashLight.position.set(x0, y0, z0);
            this.flashLight.intensity = (weapon === 'shotgun' || weapon === 'rifle') ? 4.8 : 3.2;
            this.flashT = 0.065;
        }

        update(dt) {
            if (this.flashT > 0) {
                this.flashT -= dt;
                if (this.flashT <= 0) this.flashLight.intensity = 0;
            }

            let vertIdx = 0;
            const pos = this.positions;
            const col = this.colors;

            for (let i = this.tracers.length - 1; i >= 0; i--) {
                const tr = this.tracers[i];
                tr.life += dt;
                const p = tr.life / tr.duration;

                if (p >= 1.35) {
                    this.tracers.splice(i, 1);
                    continue;
                }

                const headProgress = Math.min(1.0, p / 0.82);
                const headDist = headProgress * tr.dist;
                const tailDist = Math.max(0, headDist - tr.streakLen);

                const hx = tr.x0 + tr.dx * headDist;
                const hy = tr.y0 + tr.dy * headDist;
                const hz = tr.z0 + tr.dz * headDist;

                const tx = tr.x0 + tr.dx * tailDist;
                const ty = tr.y0 + tr.dy * tailDist;
                const tz = tr.z0 + tr.dz * tailDist;

                const alpha = p > 0.82 ? Math.max(0, 1 - (p - 0.82) / 0.53) : 1.0;

                // Vertex 1: Tail
                pos[vertIdx * 3] = tx;
                pos[vertIdx * 3 + 1] = ty;
                pos[vertIdx * 3 + 2] = tz;
                col[vertIdx * 3] = tr.color[0] * alpha * 0.35;
                col[vertIdx * 3 + 1] = tr.color[1] * alpha * 0.35;
                col[vertIdx * 3 + 2] = tr.color[2] * alpha * 0.35;
                vertIdx++;

                // Vertex 2: Head
                pos[vertIdx * 3] = hx;
                pos[vertIdx * 3 + 1] = hy;
                pos[vertIdx * 3 + 2] = hz;
                col[vertIdx * 3] = tr.color[0] * alpha;
                col[vertIdx * 3 + 1] = tr.color[1] * alpha;
                col[vertIdx * 3 + 2] = tr.color[2] * alpha;
                vertIdx++;
            }

            // Zero out remaining unused slots
            for (let i = vertIdx; i < this.maxTracers * 2; i++) {
                pos[i * 3] = 0; pos[i * 3 + 1] = -500; pos[i * 3 + 2] = 0;
                col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0;
            }

            this.posAttr.needsUpdate = true;
            this.colAttr.needsUpdate = true;
        }

        clear() {
            this.tracers.length = 0;
            if (this.flashLight) this.flashLight.intensity = 0;
        }
    }
