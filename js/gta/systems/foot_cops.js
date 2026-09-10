    // ===========================================================================
    // FOOT COPS — uniformed officers that exit cruisers and fight face-to-face,
    // and station guards that defend the police HQ during a jail escape.
    // ===========================================================================
    class FootCopSystem {
        constructor(game, scene, mat, assets) {
            this.game = game;
            this.field = game.field;
            this.map = game.builder ? game.builder.map : null;
            this.physics = game.physics;
            this.scene = scene;
            this.mat = mat;
            this.assets = assets;
            this.cops = [];
            this._q = [];
        }
        _rig(colors, isSwat) {
            const matFlat = this.mat && this.mat.flat;
            const glb = isSwat
                ? (this.assets && this.assets.characters && this.assets.characters.swat)
                : (this.assets && this.assets.characters && (this.assets.characters.cop || this.assets.characters.swat));
            const rig = new HumanRig(matFlat, colors, glb, this.assets);
            this.scene.add(rig.group);
            return rig;
        }
        /** Spawn an officer. Returns the officer or null. */
        spawn(x, z, y, heading, opts) {
            opts = opts || {};
            const isSwat = opts.mode === 'swat' || !!opts.isSwat;
            const colors = opts.colors || (isSwat ? {
                shirt: [0.10, 0.12, 0.15], pants: [0.08, 0.10, 0.12],
                skin: [0.85, 0.72, 0.60]
            } : {
                shirt: [0.14, 0.20, 0.30], pants: [0.10, 0.14, 0.22],
                skin: [0.90, 0.78, 0.65]
            });
            const rig = this._rig(colors, isSwat);
            const cop = {
                rig, x, z, y: y !== undefined ? y : 0, heading: heading || 0,
                baseRotY: heading || 0,
                health: opts.health || 60,
                fireCd: Math.random() * 0.5,
                senseCd: 0,
                range: opts.range || 22,
                // 'pursuit' cops chase the player; 'guard' cops hold a station post
                // and only engage the player if they stray too close.
                mode: opts.mode || 'pursuit',
                guard: opts.guard || null,      // {x, z} anchor for guards
                fromCruiser: opts.fromCruiser || null,
                cmd: 'walk',
                dead: false, anim: 0, hurtT: 0, fwd: 0,
            };
            this.cops.push(cop);
            this._pose(cop);
            return cop;
        }
        remove(cop) {
            const i = this.cops.indexOf(cop);
            if (i === -1) return;
            this.cops.splice(i, 1);
            if (cop.rig && cop.rig.group) this.scene.remove(cop.rig.group);
        }
        /** Direct hit from a player projectile. Returns true if it connected. */
        hitTest(ox, oy, oz, dx, dy, dz, range) {
            let bestT = range, hit = null;
            for (const c of this.cops) {
                if (c.dead) continue;
                const t = rayPointDist({ x: ox, y: oy, z: oz, dx, dy, dz }, c.x, c.y + 1.0, c.z, 0.45);
                if (t !== null && t < bestT) { bestT = t; hit = c; }
            }
            if (!hit) return null;
            hit.health -= 15;
            hit.hurtT = 0.25;
            if (this.game.fx && this.game.fx.copShot) this.game.fx.copShot(ox, oy, oz, hit.x, hit.y + 1.0, hit.z);
            if (hit.health <= 0) {
                this.kill(hit);
                return { t: bestT, dead: true };
            }
            return { t: bestT, cop: hit };
        }
        kill(cop) {
            if (cop.dead) return;
            cop.dead = true;
            const g = this.game;
            if (g) {
                if (g.particles) g.particles.burst('blood', cop.x, cop.y + 1.1, cop.z, 1.2);
                if (g.stats) g.stats.kills++;
                if (g.audio && g.audio.scream) g.audio.scream(cop.x, cop.z);
                // Murdering an on-duty officer is a serious crime.
                if (g.police && g.police.reportCrime) g.police.reportCrime(2, cop.x, cop.z, g.fx);
                // Killing an officer while trying to escape earns the keys.
                if (g._jail && g._jail.active) this._dropKey(cop);
            }
            this.remove(cop);
        }
        _dropKey(cop) {
            const g = this.game;
            if (g._jail && !g._jail.keys) {
                g._jail.keys = true;
                if (g.hud) g.hud.toast('You grabbed the cell KEYS! Unlock the door and escape!', '#ffd24b');
                if (g.audio && g.audio.pickup) g.audio.pickup('item');
            }
        }
        _pose(cop) {
            const r = cop.rig;
            r.group.position.set(cop.x, cop.y, cop.z);
            r.group.rotation.y = cop.heading;
            const t = cop.anim * 0.0;
            const walk = cop.cmd === 'walk' ? Math.sin(cop.anim) * 0.5 : 0;
            if (r.torso) r.torso.rotation.set(0.06 + (cop.cmd === 'fire' ? -0.05 : 0), 0, 0);
            if (r.head) r.head.rotation.set(cop.cmd === 'fire' ? -0.12 : 0.05, 0, 0);
            if (r.armL) r.armL.rotation.set(cop.cmd === 'fire' ? -1.25 : (0.2 + walk * 0.2), 0, 0);
            if (r.armR) r.armR.rotation.set(cop.cmd === 'fire' ? -1.3 + t : (0.2 - walk * 0.2), 0, 0);
            if (r.legL) r.legL.rotation.set(cop.cmd === 'walk' ? Math.sin(cop.anim) * 0.55 : 0, 0, 0);
            if (r.legR) r.legR.rotation.set(cop.cmd === 'walk' ? Math.sin(cop.anim + Math.PI) * 0.55 : 0, 0, 0);
        }
        update(dt, player, fx) {
            const px = player ? player.pos.x : 0, pz = player ? player.pos.z : 0;
            for (let i = this.cops.length - 1; i >= 0; i--) {
                const c = this.cops[i];
                if (c.dead) { this.remove(c); continue; }
                c.anim += dt * (c.cmd === 'walk' ? 7 : 4);
                if (c.hurtT > 0) c.hurtT -= dt;
                c.senseCd -= dt;
                const dx = px - c.x, dz = pz - c.z;
                const d = Math.hypot(dx, dz) || 1;
                c.fwd = c.cmd === 'walk' ? 1 : 0;
                if (c.docile) {
                    // The jail key-officer: updateJail drives their pacing, so the
                    // AI only keeps them posed and alive. They never open fire.
                    c.cmd = 'idle';
                    this._pose(c);
                    continue;
                }
                if (c.mode === 'guard' && c.guard) {
                    // Station guards: hold their post, chase only intruders nearby.
                    if (d < 14) {
                        c.cmd = d > 2.2 ? 'walk' : 'fire';
                        if (c.cmd === 'walk') {
                            const hd = Math.atan2(-dx, -dz);
                            c.heading = c.baseRotY + angleDelta(hd, c.baseRotY) * 0.12;
                        } else c.heading = Math.atan2(-dx, -dz);
                        if (d < 26 && c.cmd === 'fire') this._fire(c, dt, px, pz, fx, player);
                    } else {
                        c.cmd = 'idle'; c.heading = c.baseRotY;
                    }
                } else {
                    if (d > 6) { c.cmd = 'walk'; c.heading = Math.atan2(-dx, -dz); }
                    else { c.cmd = 'fire'; c.heading = Math.atan2(-dx, -dz); this._fire(c, dt, px, pz, fx, player); }
                }
                if (c.cmd === 'walk') {
                    const spd = 3.4;
                    c.x += -Math.sin(c.heading) * spd * dt;
                    c.z += -Math.cos(c.heading) * spd * dt;
                }
                this._pose(c);
            }
        }
        _fire(c, dt, px, pz, fx, player) {
            const plyr = player || (this.game && this.game.player);
            c.fireCd -= dt;
            if (c.fireCd > 0) return;
            const dx = px - c.x, dz = pz - c.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d > c.range) return;
            // Line of sight check.
            let blocked = false;
            if (this.physics) {
                const wall = this.physics.raycast(c.x, 1.2, c.z, dx / d, 0.02, dz / d, d, this._q);
                if (wall && wall.dist < d - 2) blocked = true;
            }
            if (blocked) return;
            c.fireCd = 1.15 + Math.random() * 0.5;
            const targetY = (plyr && plyr.pos) ? plyr.pos.y + 1.2 : 1.2;
            if (fx && fx.copShot) fx.copShot(c.x, 1.2, c.z, px, targetY, pz);
            if (plyr && !plyr.dead && plyr.damage) {
                let dmg = 5 + Math.random() * 3;
                plyr.damage(dmg, fx);
            }
        }
    }
