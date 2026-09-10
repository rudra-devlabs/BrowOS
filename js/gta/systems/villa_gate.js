    /**
     * VillaGateSystem — the VIP villa's motorized sliding gate.
     *
     * The two slatted wings (built by CityBuilder as world-aligned slide
     * groups, NOT baked into chunk geometry) glide apart smoothly:
     *   - on foot: auto-opens as you walk up to it (7.5 m)
     *   - in a vehicle: honk [H] within 16 m (latched 3 s), or creep to 6.5 m
     * Holds while anyone is in the gateway, then eases shut. While mostly
     * closed the gate does its own push-out (player + player vehicle), since
     * build-time collider/BVH snapshots cannot follow a moving obstacle —
     * the same pattern ParkingGateSystem documents for its booms.
     */
    class VillaGateSystem {
        constructor(spec) {
            this.spec = spec || null;
            this.k = 0;             // 0 closed .. 1 open
            this.state = 0;         // 0 closed, 1 opening, 2 open, 3 closing
            this.t = 0;
            this.hold = 0;
            this.honkUntil = -1;
            if (typeof console !== 'undefined') {
                console.log('[VillaGate]', spec ? 'online at (' + spec.cx + ', ' + spec.cz + ')' : 'NO SPEC — gate will stay shut');
            }
        }

        update(dt, time, player, input, audio, hud) {
            const s = this.spec;
            if (!s || !player || !player.pos) return;
            const pv = player.inVehicle || null;
            const rx = pv ? pv.x : player.pos.x;
            const rz = pv ? pv.z : player.pos.z;
            const dx = rx - s.cx, dz = rz - s.cz;
            const d2 = dx * dx + dz * dz;
            let want = false;
            if (!pv) {
                // On foot: just walk up, the gate reads you coming.
                if (d2 < 9.0 * 9.0) want = true;
            } else if (d2 < 20 * 20) {
                // In a car: honk to announce yourself. The honk latches so a
                // tap is enough — no need to hold H all the way in.
                const honking = !!(input && input.keys && input.keys.KeyH);
                if (honking) this.honkUntil = time + 4.0;
                if (time < this.honkUntil) want = true;
                // Failsafe: crawling right up to a shut gate opens it anyway.
                else if (d2 < 8.0 * 8.0 && Math.abs(pv.speed || 0) < 14) want = true;
                if (hud && hud.setPrompt && this.k < 0.6) hud.setPrompt('[H] Honk — open the villa gate');
            }
            // Never shut the gate on a guest standing or parked in the way.
            if (Math.abs(dx) < 7.5 && Math.abs(dz) < 4.5) want = true;

            // Four states with eased curves that invert exactly on reversal,
            // so arriving halfway through a close sends it back from where it
            // is (same convention as ParkingGateSystem).
            if (this.state === 0) {
                if (want) { this.state = 1; this.t = 0; this._servo(audio, true); }
            } else if (this.state === 1) {
                this.t += dt;
                if (this.t >= 1.6) { this.t = 1.6; this.k = 1; this.state = 2; this.hold = 2.0; }
                else { const u = this.t / 1.6; this.k = 1 - (1 - u) * (1 - u) * (1 - u); }
            } else if (this.state === 2) {
                this.k = 1;
                if (want) this.hold = 2.0;
                else if ((this.hold -= dt) <= 0) { this.state = 3; this.t = 0; this._servo(audio, false); }
            } else {
                if (want) {
                    this.state = 1;
                    this.t = 1.6 * (1 - Math.cbrt(Math.max(0, 1 - this.k)));
                    this._servo(audio, true);
                } else {
                    this.t += dt;
                    if (this.t >= 2.2) { this.t = 0; this.k = 0; this.state = 0; }
                    else { const u = this.t / 2.2; this.k = (1 - u) * (1 - u); }
                }
            }

            // Pose: wings slide outward along the wall and ride slightly proud
            // of the facade so they glide over the pillars, not through them.
            const off = s.closedOff + this.k * s.slide;
            const z = s.cz + this.k * s.lift;
            s.slideL.position.set(s.cx - off, s.cy, z);
            s.slideR.position.set(s.cx + off, s.cy, z);

            if (this.k < 0.8) this._block(player, pv, dt);
        }

        /** Gate servo blip. Guarded: audio may be muted or missing. */
        _servo(audio, opening) {
            if (!audio || !audio.blip) return;
            try {
                if (opening) audio.blip(300, 0.28, 'sawtooth', 0.10, 640);
                else audio.blip(560, 0.28, 'sawtooth', 0.08, 240);
            } catch (e) {}
        }

        /** Keep the player (and their car) on their own side of shut wings. */
        _block(player, pv, dt) {
            const s = this.spec;
            const off = s.closedOff + this.k * s.slide;
            const z = s.cz + this.k * s.lift;
            this._pushCircle(player.pos, 0.38, s, off, z);
            if (pv) {
                const rVeh = (pv.spec && pv.spec.W ? pv.spec.W * 0.5 : 1.2);
                if (this._pushCircle(pv, rVeh, s, off, z) && pv.speed !== undefined) {
                    // Grinding a shut gate scrubs speed instead of clipping in.
                    pv.speed *= Math.max(0, 1 - 4 * dt);
                }
            }
        }

        /**
         * Push a world XZ point out of the two wing boxes. Wings are
         * axis-aligned (the estate is world-aligned), centered at
         * cx ± off with half extents (wingHalf, 0.28).
         * Normal to the gate is along Z, so collision push correctly deflects
         * along Z without side-slipping through the center seam.
         */
        _pushCircle(pos, r, s, off, z) {
            let moved = false;
            const hx = s.wingHalf, hz = 0.28;
            for (let side = -1; side <= 1; side += 2) {
                const wx = s.cx + side * off;
                const cx = Math.max(wx - hx, Math.min(wx + hx, pos.x));
                const cz = Math.max(z - hz, Math.min(z + hz, pos.z));
                const dx = pos.x - cx, dz = pos.z - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 > 1e-8) {
                    if (d2 < r * r) {
                        const d = Math.sqrt(d2);
                        const pen = r - d;
                        pos.x += (dx / d) * pen;
                        pos.z += (dz / d) * pen;
                        moved = true;
                    }
                } else {
                    // Deep penetration inside wing box: push out along Z (normal to gate)
                    const pz = hz + r;
                    pos.z = z + (pos.z >= z ? pz : -pz);
                    moved = true;
                }
            }
            return moved;
        }
    }
