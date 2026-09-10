    // ===========================================================================
    // AMBULANCE SERVICE — dispatches an ambulance to carry a fallen citizen off
    // to Bellevue, then drives it away. Bodies are queued on NPC death.
    // ===========================================================================
    class AmbulanceService {
        constructor(game, field, map, physics) {
            this.game = game;
            this.field = field;
            this.map = map;
            this.physics = physics;
            this.bodies = [];       // queued {x, z}
            this.amb = null;        // active ambulance vehicle
            this.phase = null;      // 'toBody' | 'loading' | 'toHospital' | 'gone'
            this.cd = 0;
            this._ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
        }
        queue(x, z) {
            if (this.bodies.length > 4) return;
            this.bodies.push({ x, z });
        }
        spawnAmb() {
            const edges = this.map && this.map.edges;
            const target = this.bodies[0];
            if (!edges || !target) return null;
            let best = null, bestD = Infinity;
            for (const e of edges) {
                const cx = (e.ax + e.bx) / 2, cz = (e.az + e.bz) / 2;
                const d = dist2(cx, cz, target.x, target.z);
                if (d < bestD) { bestD = d; best = e; }
            }
            if (!best) return null;
            const e = best;
            const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
            // No AI driver: AmbulanceService steers it manually; the traffic
            // system must not double-drive it either.
            const v = this.field.spawn('ambulance', mx, mz, Math.atan2(-e.dirX, -e.dirZ), { driver: null, color: 0xffffff });
            if (v) { v.ai = null; v.speed = 0; }
            return v;
        }
        _drive(v, tx, tz, dt) {
            const dx = tx - v.x, dz = tz - v.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d < 4) { v.speed *= 0.6; return d < 2.2; }
            const desired = Math.atan2(-dx, -dz);
            const err = angleDelta(v.heading, desired);
            const c = this._ctrl;
            c.throttle = 0.7; c.brake = 0;
            c.steer = clamp(err * 1.6, -1, 1); c.handbrake = false;
            if (Math.abs(err) > 1.8 && v.speed > 5) { c.throttle = 0; c.brake = 0.7; }
            this.field.step(v, dt, c, this.physics, this.game.fx);
            return false;
        }
        update(dt, time, player) {
            this.cd -= dt;
            if (this.phase === null && this.bodies.length && this.cd <= 0) {
                const amb = this.spawnAmb();
                if (amb) { this.amb = amb; this.phase = 'toBody'; }
            }
            if (!this.phase) return;
            const v = this.amb;
            if (!v || v.dead || v.gone) {
                this.phase = null; this.amb = null;
                if (!v) this.cd = 8;
                return;
            }
            if (this.phase === 'toBody') {
                const body = this.bodies[0];
                if (!body) { this.finish(); return; }
                if (this._drive(v, body.x, body.z, dt)) {
                    this.phase = 'loading';
                    v.speed = 0;
                    this.bodies.shift();
                    if (this.game.fx) this.game.fx.bark('🚑 Emergency! Medics on the scene!', body.x, 2.0, body.z);
                }
            } else if (this.phase === 'loading') {
                this._loadT = (this._loadT || 0) + dt;
                if (this._loadT > 1.8) {
                    this._loadT = 0;
                    this.phase = 'toHospital';
                }
            } else if (this.phase === 'toHospital') {
                const h = this.game.hospital || (this.map && this.map.hospital);
                const hx = h ? h.spawnX : (this.game.builder ? this.game.builder.hospitalSpawn.x : 1077);
                const hz = h ? h.spawnZ : (this.game.builder ? this.game.builder.hospitalSpawn.z : 2266);
                if (this._drive(v, hx, hz, dt)) {
                    this.finish();
                }
            }
        }
        finish() {
            if (this.amb && this.amb.driver !== 'player' && !this.amb.isPlayerVehicle) {
                this.amb.driver = null;
                this.field.remove(this.amb);
            }
            this.amb = null; this.phase = null;
            this._loadT = 0;
            this.cd = 10;
            if (this.game && this.game.hud) this.game.hud.toast('🚑 Ambulance delivered the patient to Bellevue', '#57ddba');
        }
    }
