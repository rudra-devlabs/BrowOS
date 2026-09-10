    // ===========================================================================
    // BUS SYSTEM — bus stops where a citizen can pay a small fare, pick any
    // destination on the map, and ride across the city.
    // ===========================================================================
    class BusSystem {
        constructor(game, scene, mat, field, map, physics, hud) {
            this.game = game;
            this.scene = scene;
            this.mat = mat;
            this.field = field;
            this.map = map;
            this.physics = physics;
            this.hud = hud;
            this.stops = [];
            this.bus = null;
            this.phase = null;   // 'enroute' | 'atStop' | 'away'
            this.pendingDest = null; // destination queued once a bus pulls up
            this.dispCd = 0;
            this._ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
            this._buildStops();
        }
        _buildStops() {
            // Coordinates chosen on/near the city's main corridors (axles of the
            // subway stops + a few extra tourist points).
            const raw = [
                ['Times Square', 450, 1870, '#e53b3b'],
                ['Herald Square', 530, 1940, '#e53b3b'],
                ['Central Park West', 360, 1450, '#eaa11a'],
                ['Chinatown', 400, 3200, '#00933c'],
                ['Wall Street', 490, 2400, '#00933c'],
                ['Union Square', 580, 2700, '#00933c'],
                ['Financial District', 705, 3206, '#4b8bff'],
                ['Empire State', 761, 2168, '#e53b3b'],
                ['Central Station', 875, 1973, '#b933ad'],
                ['Brooklyn Waterfront', 1240, 3150, '#b933ad'],
            ];
            for (const s of raw) {
                this.stops.push({ id: s[0].toLowerCase().replace(/\\s+/g, '-'), name: s[0], x: s[1], z: s[2], color: s[3] });
            }
        }
        update(dt, time, player, fx) {
            this.dispCd -= dt;
            const near = this._near(player);
            if (near) {
                const riding = this.phase === 'enroute' || this.phase === 'atStop';
                if (!riding) this.hud.setPrompt('[E] Board Brow City Bus ($2) · pick any stop on the map');
            }
        }
        _near(player) {
            if (!player) return null;
            let best = null, bd = 3.6;
            for (const s of this.stops) {
                const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
                if (d < bd) { bd = d; best = s; }
            }
            return best;
        }
        /** Begin boarding: dispatch a bus to the nearest stop. */
        boardFrom(stop, player) {
            if (this.phase !== null) return;
            const edges = this.map && this.map.edges;
            if (!edges) return;
            let best = null, bd = Infinity;
            for (const e of edges) {
                const cx = (e.ax + e.bx) / 2, cz = (e.az + e.bz) / 2;
                const d = dist2(cx, cz, stop.x, stop.z);
                if (d < bd) { bd = d; best = e; }
            }
            if (!best) return;
            const e = best;
            // Spawn with no AI driver so the traffic system never double-drives
            // this bus; BusSystem's own _drive steers it.
            const v = this.field.spawn('bus', (e.ax + e.bx) / 2, (e.az + e.bz) / 2,
                Math.atan2(-e.dirX, -e.dirZ), { driver: null, color: 0xffffff });
            if (!v) { this.hud.toast('No buses available right now — try again', '#ff8a80'); return; }
            v.ai = null;
            v.speed = 0;
            this.bus = v;
            this.phase = 'enroute';
            this.stop = stop;
            this.hud.toast('🚌 A bus is pulling up…', '#57ddba');
        }
        _drive(v, tx, tz, dt, slow) {
            const dx = tx - v.x, dz = tz - v.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d < 4) { v.speed *= 0.6; return d < 2.4; }
            const desired = Math.atan2(-dx, -dz);
            const err = angleDelta(v.heading, desired);
            const c = this._ctrl;
            const spd = slow ? 0.6 : 0.85;
            c.throttle = spd; c.brake = 0;
            c.steer = clamp(err * 1.6, -1, 1); c.handbrake = false;
            if (Math.abs(err) > 1.9 && v.speed > 5) { c.throttle = 0; c.brake = 0.8; }
            this.field.step(v, dt, c, this.physics, this.game.fx);
            return false;
        }
        updateBus(dt, player) {
            const v = this.bus;
            if (!this.phase) return;
            if (!v || v.dead || v.gone) { this.phase = null; this.bus = null; return; }
            if (this.phase === 'enroute') {
                const stop = this.stop;
                if (this._drive(v, stop.x, stop.z, dt, true)) {
                    v.speed = 0;
                    this.phase = 'atStop';
                    this.hud.toast('🚌 Bus has arrived. Press F to board.', '#57ddba');
                }
            } else if (this.phase === 'atStop') {
                if (this.pendingDest) {
                    const d = this.pendingDest;
                    this.pendingDest = null;
                    this.startRide(d);
                } else {
                    v.speed = 0;
                }
            } else if (this.phase === 'away') {
                if (this._drive(v, this.away.x, this.away.z, dt, false)) {
                    if (this.bus && this.bus.driver !== 'player' && !this.bus.isPlayerVehicle) {
                        this.bus.driver = null;
                        this.field.remove(this.bus);
                    }
                    this.bus = null; this.phase = null;
                    this.hud.toast('🚌 Thank you for riding Brow City Transit', '#57ddba');
                }
            }
        }
        /** After the destination is chosen, begin the ride. */
        startRide(dest) {
            if (!this.bus || this.phase !== 'atStop') return;
            const p = this.game.player;
            this.hud.closeBusModal();
            this.game._busModalOpen = false;
            // The player climbs aboard.
            this.phase = 'away';
            this.away = { x: dest.x, z: dest.z };
            p.inVehicle = null;
            const v = this.bus;
            if (this.game.audio && this.game.audio.subwayChime) this.game.audio.subwayChime();
            this.hud.showBusRide(dest, () => {
                p.pos.set(dest.x, 0.25, dest.z);
                p.vel.set(0, 0, 0);
                p.heading = dest.ry || 0;
                this.game.camera.position.set(dest.x, 2.5, dest.z + 4);
                this.game.camera.lookAt(dest.x, 1.2, dest.z);
                this.hud.toast('Arrived at ' + dest.name, '#57ddba');
                // Buses stop at the destination stop.
                const ns = this._nearestStop(dest.x, dest.z);
                if (ns && this.bus) {
                    this.bus.x = ns.x;
                    this.bus.z = ns.z;
                }
                this.bus = null; this.phase = null; this.dispCd = 8;
            });
        }
        _nearestStop(x, z) {
            let best = null, bd = Infinity;
            for (const s of this.stops) {
                const d = dist2(x, z, s.x, s.z);
                if (d < bd) { bd = d; best = s; }
            }
            return best;
        }
        /** Player picked a destination (list or map). Charge fare & dispatch a bus. */
        _startBusRide(dest) {
            const game = this.game;
            const p = game.player;
            if (!dest || !p) { if (game.closeBus) game.closeBus(); return; }
            const near = this._near(p);
            if (!near) { game.hud.toast('Not near a bus stop', '#ff8a80'); if (game.closeBus) game.closeBus(); return; }
            const fare = 2;
            if (p.money >= fare) {
                p.money = Math.round((p.money - fare) * 100) / 100;
                if (game.hud && game.hud.setMoney) game.hud.setMoney(p.money);
                game.hud.toast('Bus fare -$2.00', '#8ec5ff');
            } else {
                game.hud.toast('Fare evaded! 🚔', '#ff8a80');
                if (game.police && game.police.reportCrime) game.police.reportCrime(1, p.pos.x, p.pos.z, game.fx);
            }
            this.pendingDest = dest;
            this.boardFrom(near, p);
        }
    }
