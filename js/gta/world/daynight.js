    // ===========================================================================
    // DAY-NIGHT SYSTEM — dynamic sky, sun, moon, stars, clouds, and lighting
    // ===========================================================================
    class DayNightSystem {
        constructor(game) {
            this.game = game;
            this.scene = game.scene;
            // 240 seconds (4 minutes) real-time for full 24-hour cycle
            this.cycleDuration = 240;
            // Start at 09:30 AM (0.395)
            this.timeOfDay = 0.395;

            // Celestial group for sky elements that track player
            this.celestialGroup = new THREE.Group();
            this.scene.add(this.celestialGroup);

            // Glow texture from shared materials
            const glowTex = (game.sharedMat && game.sharedMat.glow) ? game.sharedMat.glow.map : null;

            // 1. Sun Mesh & Corona Flare
            const sunGeo = new THREE.CircleGeometry(68, 32);
            const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffef4, depthWrite: false, fog: false, side: THREE.DoubleSide });
            this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
            if (glowTex) {
                const coronaGeo = new THREE.PlaneGeometry(420, 420);
                const coronaMat = new THREE.MeshBasicMaterial({
                    map: glowTex, color: 0xffd26a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
                });
                this.sunMesh.add(new THREE.Mesh(coronaGeo, coronaMat));
                const flareGeo = new THREE.PlaneGeometry(640, 640);
                const flareMat = new THREE.MeshBasicMaterial({
                    map: glowTex, color: 0xff9922, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
                });
                this.sunMesh.add(new THREE.Mesh(flareGeo, flareMat));
            }
            this.celestialGroup.add(this.sunMesh);

            // 2. Moon Mesh & Lunar Halo
            const moonTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
                ctx.fillStyle = '#ebf2ff';
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
                ctx.fill();
                // Lunar maria / craters
                ctx.fillStyle = 'rgba(150, 168, 200, 0.42)';
                const craters = [[44, 46, 14], [80, 52, 17], [52, 82, 19], [86, 84, 11], [36, 86, 9], [68, 36, 8]];
                for (const [cx, cy, cr] of craters) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            const moonGeo = new THREE.CircleGeometry(52, 32);
            const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
            this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
            if (glowTex) {
                const moonHaloGeo = new THREE.PlaneGeometry(340, 340);
                const moonHaloMat = new THREE.MeshBasicMaterial({
                    map: glowTex, color: 0x8ab4f8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
                });
                this.moonMesh.add(new THREE.Mesh(moonHaloGeo, moonHaloMat));
            }
            this.celestialGroup.add(this.moonMesh);

            // 3. Stars Field (upper hemisphere)
            const starCount = 650;
            const starPos = [];
            for (let i = 0; i < starCount; i++) {
                const phi = Math.acos(1 - Math.random() * 0.92);
                const theta = Math.random() * Math.PI * 2;
                const r = 2200;
                starPos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 120, r * Math.sin(phi) * Math.sin(theta));
            }
            const starGeo = new THREE.BufferGeometry();
            starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
            this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, transparent: true, opacity: 0.0, fog: false });
            this.stars = new THREE.Points(starGeo, this.starMat);
            this.celestialGroup.add(this.stars);

            // 4. Directional Lights
            this.sunLight = game.sun;
            this.moonLight = new THREE.DirectionalLight(0x8ab4f8, 0.0);
            this.moonLight.castShadow = false;
            this.scene.add(this.moonLight);
            this.scene.add(this.moonLight.target);

            // 5. Sky Dome texture reference
            this.skyMesh = game.skyMesh;
            this.skyTex = (game.sharedMat && game.sharedMat.sky) ? game.sharedMat.sky.map : null;
            this.skyCanvas = this.skyTex ? this.skyTex.image : null;
            this.skyCtx = this.skyCanvas ? this.skyCanvas.getContext('2d') : null;

            // 6. Procedural Puffy Clouds
            this._initClouds();

            // Reusable objects
            this._sunDir = new THREE.Vector3();
            this._moonDir = new THREE.Vector3();
            this._lastSkyT = -1;
        }

        _initClouds() {
            this.clouds = [];
            const cloudCount = 36;
            const rng = mulberry32(20260905);
            for (let i = 0; i < cloudCount; i++) {
                const b = new GeoBatch();
                const mainW = 150 + rng() * 140;
                const mainH = 26 + rng() * 20;
                const mainD = 95 + rng() * 65;
                b.box(0, 0, 0, mainW, mainH, mainD, [1, 1, 1]);
                const puffs = 5 + (rng() * 4 | 0);
                for (let p = 0; p < puffs; p++) {
                    const ang = (p / puffs) * Math.PI * 2 + rng() * 0.4;
                    const rad = (mainW * 0.36) * (0.6 + rng() * 0.5);
                    const ox = Math.cos(ang) * rad;
                    const oz = Math.sin(ang) * (mainD * 0.36);
                    const oy = (rng() - 0.25) * (mainH * 0.7);
                    b.box(ox, oy, oz, 48 + rng() * 45, 20 + rng() * 18, 42 + rng() * 40, [1, 1, 1]);
                }
                const geo = b.buildGeometry();
                const mat = new THREE.MeshLambertMaterial({
                    color: 0xffffff, transparent: true, opacity: 0.94, depthWrite: false, fog: false
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                const x = -800 + rng() * 3200;
                const y = 160 + rng() * 140;
                const z = 250 + rng() * 2900;
                mesh.position.set(x, y, z);
                mesh.rotation.y = rng() * Math.PI * 2;
                this.scene.add(mesh);
                this.clouds.push({
                    mesh, mat,
                    speed: 4.5 + rng() * 5.5,
                    driftZ: (rng() - 0.5) * 1.5,
                    initialY: y
                });
            }
        }

        advanceTime(hours = 3.0) {
            this.timeOfDay = (this.timeOfDay + hours / 24) % 1;
            if (this.timeOfDay < 0) this.timeOfDay += 1;
            const px = (this.game && this.game.player) ? this.game.player.pos.x : 770;
            const pz = (this.game && this.game.player) ? this.game.player.pos.z : 1830;
            this.update(0.016, px, pz);
            const t = this.getTime();
            if (this.game && this.game.hud && this.game.hud.setTime) {
                this.game.hud.setTime(t.hours, t.minutes, t.isDay);
                this.game.hud.toast(`Time: ${t.str} (${t.phase}) · [T] Cycle`, '#ffd54f');
            }
            return t;
        }

        setTime(hours) {
            if (typeof hours === 'string') {
                const s = hours.toLowerCase().trim();
                if (s === 'noon' || s === 'midday' || s === 'day') hours = 12.0;
                else if (s === 'sunset' || s === 'dusk' || s === 'golden' || s === 'goldenhour') hours = 18.25;
                else if (s === 'night' || s === 'dark') hours = 22.5;
                else if (s === 'midnight') hours = 0.0;
                else if (s === 'sunrise' || s === 'dawn' || s === 'morning') hours = 6.25;
                else if (s === 'afternoon') hours = 15.0;
                else {
                    const parsed = parseFloat(s);
                    hours = isNaN(parsed) ? 12.0 : parsed;
                }
            }
            this.timeOfDay = (hours / 24) % 1;
            if (this.timeOfDay < 0) this.timeOfDay += 1;
            const px = (this.game && this.game.player) ? this.game.player.pos.x : 770;
            const pz = (this.game && this.game.player) ? this.game.player.pos.z : 1830;
            this.update(0.016, px, pz);
            const t = this.getTime();
            if (this.game && this.game.hud && this.game.hud.setTime) {
                this.game.hud.setTime(t.hours, t.minutes, t.isDay);
                this.game.hud.toast(`Time set to ${t.str} (${t.phase})`, '#ffd54f');
            }
            return t;
        }

        getTime() {
            const totalHours = this.timeOfDay * 24;
            const hours = Math.floor(totalHours) % 24;
            const minutes = Math.floor((totalHours % 1) * 60);
            const h12 = hours % 12 === 0 ? 12 : hours % 12;
            const ampm = hours < 12 ? 'AM' : 'PM';
            const mStr = minutes < 10 ? '0' + minutes : minutes;
            const isDay = hours >= 6 && hours < 19;
            const phase = hours >= 5 && hours < 9 ? 'Morning / Sunrise' :
                          hours >= 9 && hours < 17 ? 'Day / Noon' :
                          hours >= 17 && hours < 20 ? 'Sunset / Golden Hour' : 'Night';
            const icon = isDay ? (hours >= 17 && hours <= 19 ? '🌅' : '☀️') : '🌙';
            return {
                hours, minutes, isDay, phase, icon,
                str: `${h12}:${mStr} ${ampm}`,
                h12, ampm
            };
        }

        getDarkAmount() {
            const t = this.timeOfDay;
            let wNight = 0, wDawn = 0, wDay = 0, wDusk = 0;
            if (t < 0.18) {
                wNight = 1;
            } else if (t < 0.25) {
                const k = (t - 0.18) / 0.07;
                wNight = 1 - k; wDawn = k;
            } else if (t < 0.32) {
                const k = (t - 0.25) / 0.07;
                wDawn = 1 - k; wDay = k;
            } else if (t < 0.68) {
                wDay = 1;
            } else if (t < 0.76) {
                const k = (t - 0.68) / 0.08;
                wDay = 1 - k; wDusk = k;
            } else if (t < 0.84) {
                const k = (t - 0.76) / 0.08;
                wDusk = 1 - k; wNight = k;
            } else {
                wNight = 1;
            }
            return Math.max(0, Math.min(1, wNight * 1.0 + wDusk * 0.85 - wDawn * 0.6));
        }

        isDark() {
            return this.getDarkAmount() > 0.08;
        }

        update(dt, px, pz) {
            px = px !== undefined ? px : 770;
            pz = pz !== undefined ? pz : 1830;

            // Advance time continuously
            this.timeOfDay = (this.timeOfDay + dt / this.cycleDuration) % 1;

            // Celestial rotation angle
            const theta = (this.timeOfDay - 0.25) * Math.PI * 2;
            const sunCos = Math.cos(theta), sunSin = Math.sin(theta);

            // Sun direction vector (rises in east, peaks at zenith, sets in west)
            this._sunDir.set(sunCos, sunSin, sunSin * 0.35 + sunCos * 0.25).normalize();
            // Moon direction vector (opposite celestial pole)
            this._moonDir.copy(this._sunDir).negate();

            const skyDist = 1450;
            // Position 3D visual Sun
            this.sunMesh.position.set(
                this._sunDir.x * skyDist,
                this._sunDir.y * skyDist,
                this._sunDir.z * skyDist
            );
            this.sunMesh.lookAt(0, 0, 0);
            this.sunMesh.visible = (this._sunDir.y > -0.15);

            // Position 3D visual Moon
            this.moonMesh.position.set(
                this._moonDir.x * skyDist,
                this._moonDir.y * skyDist,
                this._moonDir.z * skyDist
            );
            this.moonMesh.lookAt(0, 0, 0);
            this.moonMesh.visible = (this._moonDir.y > -0.15);

            // Center celestial dome and sky sphere on player
            this.celestialGroup.position.set(px, 0, pz);
            if (this.skyMesh) {
                this.skyMesh.position.set(px, 0, pz);
            }

            // Calculate 4-phase day-night blend weights
            const t = this.timeOfDay;
            let wNight = 0, wDawn = 0, wDay = 0, wDusk = 0;
            if (t < 0.18) {
                wNight = 1;
            } else if (t < 0.25) {
                const k = (t - 0.18) / 0.07;
                wNight = 1 - k; wDawn = k;
            } else if (t < 0.32) {
                const k = (t - 0.25) / 0.07;
                wDawn = 1 - k; wDay = k;
            } else if (t < 0.68) {
                wDay = 1;
            } else if (t < 0.76) {
                const k = (t - 0.68) / 0.08;
                wDay = 1 - k; wDusk = k;
            } else if (t < 0.84) {
                const k = (t - 0.76) / 0.08;
                wDusk = 1 - k; wNight = k;
            } else {
                wNight = 1;
            }

            const lerpCol = (cNight, cDawn, cDay, cDusk) => [
                wNight * cNight[0] + wDawn * cDawn[0] + wDay * cDay[0] + wDusk * cDusk[0],
                wNight * cNight[1] + wDawn * cDawn[1] + wDay * cDay[1] + wDusk * cDusk[1],
                wNight * cNight[2] + wDawn * cDawn[2] + wDay * cDay[2] + wDusk * cDusk[2]
            ];

            // 1. Ambient Light - Luminous night ambient so city streets & canyons remain clearly visible
            const ambRgb = lerpCol([0.28, 0.34, 0.48], [0.55, 0.44, 0.40], [0.86, 0.90, 0.94], [0.58, 0.38, 0.32]);
            const ambInt = wNight * 0.46 + wDawn * 0.40 + wDay * 0.45 + wDusk * 0.38;
            if (this.game.amb) {
                this.game.amb.color.setRGB(ambRgb[0], ambRgb[1], ambRgb[2]);
                this.game.amb.intensity = ambInt;
            }

            // 2. Hemisphere Light - Crisp sky fill and sidewalk bounce
            const hemiSky = lerpCol([0.32, 0.42, 0.60], [0.92, 0.62, 0.50], [0.85, 0.91, 1.0], [0.95, 0.55, 0.40]);
            const hemiGnd = lerpCol([0.18, 0.22, 0.28], [0.35, 0.25, 0.20], [0.60, 0.56, 0.50], [0.35, 0.22, 0.18]);
            const hemiInt = wNight * 0.44 + wDawn * 0.40 + wDay * 0.48 + wDusk * 0.40;
            if (this.game.hemi) {
                this.game.hemi.color.setRGB(hemiSky[0], hemiSky[1], hemiSky[2]);
                this.game.hemi.groundColor.setRGB(hemiGnd[0], hemiGnd[1], hemiGnd[2]);
                this.game.hemi.intensity = hemiInt;
            }

            // 3. Directional Sun Light
            const sunRgb = lerpCol([0, 0, 0], [1.0, 0.72, 0.45], [1.0, 0.96, 0.90], [1.0, 0.50, 0.24]);
            const sunInt = Math.max(0, this._sunDir.y) * (wDawn * 0.70 + wDay * 0.85 + wDusk * 0.65);
            if (this.sunLight) {
                this.sunLight.color.setRGB(sunRgb[0], sunRgb[1], sunRgb[2]);
                this.sunLight.intensity = sunInt;
                this.sunLight.position.set(px + this._sunDir.x * 160, Math.max(60, this._sunDir.y * 300), pz + this._sunDir.z * 95);
                this.sunLight.target.position.set(px, 0, pz);
                this.sunLight.target.updateMatrixWorld();
                this.sunLight.castShadow = (this._sunDir.y > 0.08);
            }

            // 4. Directional Moon Light - Bright silver-blue moonlight illuminating facades & roads
            const moonElev = Math.max(0.28, Math.max(0, this._moonDir.y));
            const moonInt = moonElev * (wNight * 0.68 + wDusk * 0.25);
            if (this.moonLight) {
                this.moonLight.color.setHex(0xaad0ff);
                this.moonLight.intensity = moonInt;
                this.moonLight.position.set(px + this._moonDir.x * 160, Math.max(60, this._moonDir.y * 300), pz + this._moonDir.z * 95);
                this.moonLight.target.position.set(px, 0, pz);
                this.moonLight.target.updateMatrixWorld();
            }

            // 5. Atmospheric Fog - Soft city haze instead of pitch-black void
            const fogRgb = lerpCol([0.14, 0.18, 0.28], [0.82, 0.54, 0.46], [0.78, 0.86, 0.91], [0.86, 0.48, 0.32]);
            if (this.scene.fog) {
                this.scene.fog.color.setRGB(fogRgb[0], fogRgb[1], fogRgb[2]);
            }
            if (this.game.renderer) {
                this.game.renderer.setClearColor(new THREE.Color(fogRgb[0], fogRgb[1], fogRgb[2]), 1);
            }

            // 6. Sparkling Night Stars
            if (this.starMat) {
                this.starMat.opacity = clamp(wNight * 0.95 - wDawn * 0.5, 0, 0.95);
            }

            // 7. Water reflection sync
            const syncWater = (waterMat) => {
                if (waterMat && waterMat.uniforms) {
                    const u = waterMat.uniforms;
                    if (u.uSunDir) u.uSunDir.value.copy(this._sunDir);
                    if (u.uSunColor) u.uSunColor.value.setRGB(sunRgb[0], sunRgb[1], sunRgb[2]);
                    if (u.uSkyColor) u.uSkyColor.value.setRGB(fogRgb[0], fogRgb[1], fogRgb[2]);
                    if (u.uNightF) u.uNightF.value = clamp(wNight, 0, 1);
                }
            };
            if (this.game.sharedMat) {
                syncWater(this.game.sharedMat.water);
                syncWater(this.game.sharedMat.parkWater);
            }

            // 8. Cloud movement & dynamic lighting
            const cloudRgb = lerpCol([0.14, 0.18, 0.28], [0.98, 0.72, 0.60], [1.0, 1.0, 1.0], [1.0, 0.58, 0.42]);
            if (this.clouds) {
                for (const c of this.clouds) {
                    c.mesh.position.x += c.speed * dt;
                    c.mesh.position.z += c.driftZ * dt;
                    if (c.mesh.position.x > 2600) c.mesh.position.x = -900;
                    if (c.mesh.position.z > 3200) c.mesh.position.z = 250;
                    else if (c.mesh.position.z < 200) c.mesh.position.z = 3100;
                    c.mat.color.setRGB(cloudRgb[0], cloudRgb[1], cloudRgb[2]);
                }
            }

            // 9. Update Sky Canvas Gradient (throttled)
            if (this.skyCtx && Math.abs(this.timeOfDay - this._lastSkyT) > 0.002) {
                this._lastSkyT = this.timeOfDay;
                const top = lerpCol([0.02, 0.04, 0.09], [0.12, 0.18, 0.35], [0.24, 0.52, 0.82], [0.12, 0.12, 0.32]);
                const mid = lerpCol([0.05, 0.08, 0.16], [0.65, 0.32, 0.36], [0.52, 0.71, 0.86], [0.62, 0.22, 0.35]);
                const horiz = lerpCol([0.09, 0.14, 0.24], [0.98, 0.62, 0.40], [0.78, 0.86, 0.91], [0.96, 0.46, 0.20]);
                const bot = lerpCol([0.10, 0.15, 0.26], [0.99, 0.82, 0.55], [0.91, 0.87, 0.77], [0.98, 0.72, 0.32]);

                const g = this.skyCtx.createLinearGradient(0, 0, 0, 256);
                g.addColorStop(0.0, `rgb(${Math.round(top[0]*255)}, ${Math.round(top[1]*255)}, ${Math.round(top[2]*255)})`);
                g.addColorStop(0.45, `rgb(${Math.round(mid[0]*255)}, ${Math.round(mid[1]*255)}, ${Math.round(mid[2]*255)})`);
                g.addColorStop(0.72, `rgb(${Math.round(horiz[0]*255)}, ${Math.round(horiz[1]*255)}, ${Math.round(horiz[2]*255)})`);
                g.addColorStop(1.0, `rgb(${Math.round(bot[0]*255)}, ${Math.round(bot[1]*255)}, ${Math.round(bot[2]*255)})`);
                this.skyCtx.fillStyle = g;
                this.skyCtx.fillRect(0, 0, 4, 256);
                if (this.skyTex) this.skyTex.needsUpdate = true;
            }

            // 10. Streetlights, Flares, Mountain Road LEDs & Headlights Glow when Dark
            const darkAmount = this.getDarkAmount();
            const glowMesh = this.game.streetLampGlowMesh || (this.game.builder && this.game.builder.streetLampGlowMesh);
            const poolMesh = this.game.streetLampPoolMesh || (this.game.builder && this.game.builder.streetLampPoolMesh);
            const flareMesh = this.game.streetLampFlareMesh || (this.game.builder && this.game.builder.streetLampFlareMesh);
            const roadLightsMesh = this.game.mountainRoadLightsMesh || (this.game.builder && this.game.builder.mountainRoadLightsMesh);

            if (glowMesh && poolMesh) {
                if (darkAmount <= 0.02) {
                    if (glowMesh.visible) glowMesh.visible = false;
                    if (poolMesh.visible) poolMesh.visible = false;
                } else {
                    if (!glowMesh.visible) glowMesh.visible = true;
                    if (!poolMesh.visible) poolMesh.visible = true;
                    glowMesh.material.opacity = Math.min(1.0, darkAmount * 1.15);
                    poolMesh.material.opacity = Math.min(0.55, darkAmount * 0.55);
                }
            }
            if (flareMesh) {
                if (darkAmount <= 0.02) {
                    if (flareMesh.visible) flareMesh.visible = false;
                } else {
                    if (!flareMesh.visible) flareMesh.visible = true;
                    flareMesh.material.opacity = Math.min(0.92, darkAmount * 1.10);
                }
            }
            if (roadLightsMesh) {
                if (darkAmount <= 0.02) {
                    roadLightsMesh.material.opacity = 0.25;
                } else {
                    roadLightsMesh.visible = true;
                    roadLightsMesh.material.opacity = 0.25 + Math.min(0.75, darkAmount * 1.35);
                }
            }

            // Dynamic Mountain Road Illumination PointLight (casts real 3D light onto vehicle, road, and cliffs)
            if (!this.mountainRoadLight && this.scene) {
                this.mountainRoadLight = new THREE.PointLight(0xffea90, 0, 48, 1.4);
                this.scene.add(this.mountainRoadLight);
            }
            if (this.mountainRoadLight) {
                const onMountain = (px >= -890 && px <= -630 && pz >= 1530 && pz <= 1720);
                if (darkAmount > 0.04 && onMountain) {
                    this.mountainRoadLight.intensity = Math.min(1.8, darkAmount * 2.0);
                    this.mountainRoadLight.position.set(px, py + 4.5, pz);
                } else {
                    this.mountainRoadLight.intensity = 0;
                }
            }

            // Sync all vehicle headlights when darkness state transitions
            const isDarkNow = darkAmount > 0.05;
            if (this._lastDarkState !== isDarkNow) {
                this._lastDarkState = isDarkNow;
                if (this.game.field && this.game.field.updateAllLights) {
                    this.game.field.updateAllLights();
                }
            }
        }

        destroy() {
            if (this.celestialGroup) {
                try { this.scene.remove(this.celestialGroup); } catch (e) {}
                this.celestialGroup.traverse((o) => {
                    if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
                    if (o.material) {
                        const mats = Array.isArray(o.material) ? o.material : [o.material];
                        mats.forEach((m) => {
                            if (m && (!this.game.sharedMat || (m !== this.game.sharedMat.glow && m !== this.game.sharedMat.flat))) {
                                if (m.map && (!this.game.sharedMat || m.map !== this.game.sharedMat.glow?.map)) {
                                    try { m.map.dispose(); } catch (e) {}
                                }
                                try { m.dispose(); } catch (e) {}
                            }
                        });
                    }
                });
                this.celestialGroup = null;
            }
            if (this.moonLight) {
                try { this.scene.remove(this.moonLight); } catch (e) {}
                if (this.moonLight.target) { try { this.scene.remove(this.moonLight.target); } catch (e) {} }
                this.moonLight = null;
            }
            if (this.clouds) {
                for (const c of this.clouds) {
                    if (c && c.mesh) {
                        try { this.scene.remove(c.mesh); } catch (e) {}
                        if (c.mesh.geometry) { try { c.mesh.geometry.dispose(); } catch (e) {} }
                        if (c.mesh.material) { try { c.mesh.material.dispose(); } catch (e) {} }
                    }
                }
                this.clouds = [];
            }
            this.sunMesh = null;
            this.moonMesh = null;
            this.stars = null;
            this.starMat = null;
            if (this.skyCtx) {
                try {
                    const g = this.skyCtx.createLinearGradient(0, 0, 0, 256);
                    g.addColorStop(0.0, '#4a86c8');
                    g.addColorStop(0.45, '#87b4dc');
                    g.addColorStop(0.72, '#c8dcE8');
                    g.addColorStop(1.0, '#e8ddc4');
                    this.skyCtx.fillStyle = g;
                    this.skyCtx.fillRect(0, 0, 4, 256);
                    if (this.skyTex) this.skyTex.needsUpdate = true;
                } catch (e) {}
            }
            this.skyMesh = null;
            this.skyTex = null;
            this.skyCanvas = null;
            this.skyCtx = null;
            if (this.game && this.game.renderer) {
                try { this.game.renderer.setClearColor(0x9db8cc, 1); } catch (e) {}
            }
            if (this.scene && this.scene.fog) {
                try {
                    this.scene.fog.color.setHex(0xc8dce8);
                    this.scene.fog.near = 260;
                    this.scene.fog.far = 950;
                } catch (e) {}
            }
        }
    }

