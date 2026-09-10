    // ===========================================================================
    // POLICE — wanted stars, cruiser dispatch, pursuit, busted
    // ===========================================================================
    class PoliceController {
        constructor(field, map, physics, traffic, city) {
            this.field = field;
            this.map = map;
            this.physics = physics;
            this.traffic = traffic;
            this.city = city;
            this.wanted = 0;
            this.heat = 0;        // seconds since a cruiser lost sight of the player
            this.bustT = 0;
            this.cruisers = [];   // active pursuit cruisers
            this.patrol = [];     // ambient patrol cars (rail-driven)
            this.dispatchCd = 0;
            this._q = [];
            this._ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
        }

        /** Crime report: severity 1-3. */
        reportCrime(severity, x, z, fx) {
            const before = this.wanted;
            this.wanted = Math.min(5, this.wanted + severity);
            this.heat = 0;
            if (fx && this.wanted > before) fx.wantedUp(this.wanted);
            const hud = this._hud;
            if (this.wanted > before && hud && hud.toast) {
                const tiers = {
                    1: '🚨 Wanted: Patrol cars out',
                    2: '🚔 Wanted: squad cars search',
                    3: '⚠️ Wanted: officers open fire',
                    4: '🔥 Wanted: SWAT enforcers deployed',
                    5: '💀 Wanted: maximum response',
                };
                hud.toast(tiers[this.wanted] || '', '#ff8a80');
            }
        }

        /** Keep a couple of cruisers patroling as ordinary traffic. */
        seedPatrol(rng) {
            for (let i = 0; i < 2; i++) this._spawnPatrol(rng);
        }
        _spawnPatrol(rng) {
            const edges = this.map.edges;
            const e = edges[(rng() * edges.length) | 0];
            const pType = rng() < 0.35 ? 'police_suv' : 'police';
            const v = this.field.spawn(pType, e.ax + e.dirX * 4, e.az + e.dirZ * 4,
                Math.atan2(-e.dirX, -e.dirZ), { driver: 'ai', color: 0xffffff });
            if (v) {
                v.ai = makeDriverAi(e, 4);
                v.ai.patrol = true;
                v.speed = e.speed * 0.5;
                this.patrol.push(v);
            }
            return v;
        }

        update(dt, time, player, playerVeh, fx, game) {
            if (game && game.hud) this._hud = game.hud;
            // Wanted decay when no cruiser is near.
            if (this.wanted > 0) {
                let near = false;
                for (const c of this.cruisers) {
                    if (dist2(c.x, c.z, player.pos.x, player.pos.z) < 75 * 75) { near = true; break; }
                }
                if (near) this.heat = 0;
                else {
                    this.heat += dt;
                    if (this.heat > 16) { this.wanted--; this.heat = 0; if (fx) fx.wantedDown(this.wanted); }
                }
            }
            // Dispatch pursuit cruisers.
            this.dispatchCd -= dt;
            const wantCruisers = this.wanted === 0 ? 0 : Math.min(this.wanted + 1, 7);
            if (this.cruisers.length < wantCruisers && this.dispatchCd <= 0) {
                this.dispatchCd = 2.2;
                this._dispatch(player);
            }
            // Retire cruisers when calm.
            if (this.wanted === 0 && this.cruisers.length) {
                const remaining = [];
                for (const c of this.cruisers) {
                    if (c.driver === 'player' || c.isPlayerVehicle || (game && game.player && game.player.inVehicle === c)) {
                        remaining.push(c);
                        continue;
                    }
                    c.driver = null;
                    this.field.remove(c);
                }
                this.cruisers = remaining;
            }
            // Retire deployed foot officers once the heat is off.
            if (this.wanted === 0 && game && game.footCops && game.footCops.cops) {
                for (let i = game.footCops.cops.length - 1; i >= 0; i--) {
                    const fc = game.footCops.cops[i];
                    if (fc.mode === 'pursuit') game.footCops.remove(fc);
                }
            }
            // Drive pursuit cruisers.
            const targetX = playerVeh ? playerVeh.x : player.pos.x;
            const targetZ = playerVeh ? playerVeh.z : player.pos.z;
            let anyClose = false;
            for (let i = this.cruisers.length - 1; i >= 0; i--) {
                const c = this.cruisers[i];
                if (c.dead) { this.field.remove(c); this.cruisers.splice(i, 1); continue; }
                this._pursue(c, dt, targetX, targetZ, player, playerVeh, fx, game);
                if (dist2(c.x, c.z, targetX, targetZ) < 9 * 9) anyClose = true;
            }
            // Foot officers bail out and fight face-to-face the moment the
            // player is on foot, slow, and a cruiser has closed the gap.
            if (this.wanted > 0 && !playerVeh && game && game.footCops) {
                const tgtX = player.pos.x, tgtZ = player.pos.z;
                const slow = Math.hypot(player.vel.x, player.vel.z) < 3.5;
                if (slow) {
                    for (let i = this.cruisers.length - 1; i >= 0; i--) {
                        const c = this.cruisers[i];
                        if (c.dead || c._deployed) continue;
                        if (dist2(c.x, c.z, tgtX, tgtZ) < 11 * 11) {
                            c._deployed = true;
                            this._bailCop(c, player, game);
                        }
                    }
                }
            }
            // Busted: player on foot, slow, cops right on top of them.
            if (this.wanted > 0 && !playerVeh) {
                const slow = Math.hypot(player.vel.x, player.vel.z) < 2.2;
                if (anyClose && slow) {
                    this.bustT += dt;
                    if (this.bustT > 1.7 && game) { game.onBusted(); this.bustT = 0; }
                } else this.bustT = Math.max(0, this.bustT - dt * 2);
            } else this.bustT = 0;
            // Shooter cops at 3+ stars. Rounds hit the player's CAR when
            // driving (armored by its hull) instead of melting the driver —
            // bailing out of a bullet-riddled car is the risk, not sitting in it.
            if (this.wanted >= 3) {
                for (const c of this.cruisers) {
                    c.fireCd = (c.fireCd || 0) - dt;
                    if (c.fireCd <= 0 && dist2(c.x, c.z, targetX, targetZ) < 32 * 32) {
                        c.fireCd = 1.4 + Math.random() * 0.6;
                        // Line of sight check.
                        const dx = targetX - c.x, dz = targetZ - c.z;
                        const d = Math.hypot(dx, dz) || 1;
                        const wall = this.physics.raycast(c.x, 1.2, c.z, dx / d, 0.02, dz / d, d, this._q);
                        if (!wall || wall.dist >= d - 2) {
                            if (fx) fx.copShot(c.x, 1.2, c.z, targetX, player.pos.y + 1.2, targetZ);
                            const shotDmg = 4 + this.wanted;
                            if (playerVeh && !playerVeh.dead) {
                                playerVeh.hp -= shotDmg * 0.7;
                                if (fx) fx.carImpact(8, playerVeh.x, playerVeh.y + 1, playerVeh.z);
                                if (playerVeh.hp <= 0) { playerVeh.dead = true; if (fx) fx.carDestroyed(playerVeh); }
                            } else {
                                player.damage(shotDmg, fx);
                            }
                        }
                    }
                }
            }
        }

        _dispatch(player) {
            // Spawn cruisers on edges near (but not on top of) the player.
            const edges = this.map.edges;
            const px = player.pos.x, pz = player.pos.z;
            const need = Math.min(this.wanted + 1, 7) - this.cruisers.length;
            for (let n = 0; n < need; n++) {
                const ang = Math.random() * Math.PI * 2;
                const r = 110 + Math.random() * 140;
                const sx = px + Math.cos(ang) * r, sz = pz + Math.sin(ang) * r;
                let best = null, bestD = Infinity, bestT = 0.5;
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
                if (dist2(mx, mz, px, pz) < 70 * 70) continue;
                const pType = (this.wanted >= 4 && Math.random() < 0.5) ? 'police_enforcer' : ((this.wanted >= 3 && Math.random() < 0.45) ? 'police_suv' : 'police');
                const v = this.field.spawn(pType, mx, mz,
                    Math.atan2(-e.dirX, -e.dirZ), { driver: 'police', color: 0xffffff });
                if (v) {
                    v.speed = 12;
                    v.ai = { edge: e, t: e.length * bestT };
                    this.cruisers.push(v);
                }
            }
        }

        /** Officer jumps out of the cruiser to fight the player on foot. */
        _bailCop(c, player, game) {
            const cop = game.footCops.spawn(c.x, c.z, 0, c.heading, { mode: 'pursuit', fromCruiser: c });
            if (cop) {
                if (game.audio && game.audio.pedMumble) game.audio.pedMumble(1, c.x, c.z);
                const off = this.wanted >= 3 ? 'an officer' : 'an officer';
                game.hud.toast('🚔 ' + off + ' bails out of the cruiser!', '#ff8a80');
            }
            // The cruiser stays behind, parked, as a reminder the driver bailed.
            c.driver = null;
            c.parked = true;
            c.tempPark = true;
            c._deployed = true;
            const i = this.cruisers.indexOf(c);
            if (i !== -1) this.cruisers.splice(i, 1);
            this.dispatchCd = Math.max(this.dispatchCd, 2.5);
        }

        _pursue(c, dt, tx, tz, player, playerVeh, fx, game) {
            const dx = tx - c.x, dz = tz - c.z;
            const d = Math.hypot(dx, dz) || 1;
            const desired = Math.atan2(-dx, -dz);
            const err = angleDelta(c.heading, desired);
            const ctrl = this._ctrl;
            ctrl.throttle = 1;
            ctrl.brake = 0;
            ctrl.steer = clamp(err * 1.6, -1, 1);
            ctrl.handbrake = false;
            // Slow for sharp turns; reverse when wedged.
            if (Math.abs(err) > 1.9 && c.speed > 4) { ctrl.throttle = 0; ctrl.brake = 0.7; }
            c.stuckT = (c.stuckT || 0);
            if (Math.abs(c.speed) < 0.6 && ctrl.throttle > 0) c.stuckT += dt; else c.stuckT = Math.max(0, c.stuckT - dt * 2);
            if (c.stuckT > 1.1) {
                ctrl.throttle = 0; ctrl.brake = 1; ctrl.steer = -ctrl.steer; // reverse out
                if (c.stuckT > 2.6) c.stuckT = 0;
            }
            // Ram tolerance: don't brake for the player's car.
            const hit = this.field.step(c, dt, ctrl, this.physics, fx);
            if (playerVeh) {
                const contactR = ((c.spec ? c.spec.L : 5.0) + (playerVeh.spec ? playerVeh.spec.L : 5.0)) * 0.48;
                if (dist2(c.x, c.z, playerVeh.x, playerVeh.z) < contactR * contactR && Math.abs(c.speed) > 6) {
                    c._ramCd = (c._ramCd || 0) - dt;
                    if (c._ramCd <= 0) {
                        c._ramCd = 0.5;
                        const ramDmg = Math.abs(c.speed) * 2.5;
                        playerVeh.hp = Math.max(0, playerVeh.hp - ramDmg);
                        if (fx) fx.carImpact(Math.abs(c.speed), playerVeh.x, playerVeh.y + 0.6, playerVeh.z);
                        if (playerVeh.hp <= 0 && !playerVeh.dead) {
                            playerVeh.dead = true;
                            if (fx) fx.carDestroyed(playerVeh);
                        }
                    }
                }
            }
        }
    }
