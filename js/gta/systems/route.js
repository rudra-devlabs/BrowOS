    // ===========================================================================
    // ROUTE — A* over the directed lane graph (map.nodes), used for GPS
    // waypoint guidance. Cost favors arterials (length / speed); the heuristic
    // is euclidean / max speed so it stays admissible.
    // ===========================================================================
    const WP_COLOR = '#c86bff';

    class RoutePlanner {
        static nearestNode(nodes, x, z, needOut) {
            let best = null, bd = Infinity;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (needOut && (!n.out || !n.out.length)) continue;
                const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
                if (d < bd) { bd = d; best = n; }
            }
            return best;
        }

        /** Returns [{x,z}...] node coords from start to goal, or null.
         * hx/hz optionally bias the start toward the way you're already
         * heading so a fast car doesn't get routed back the way it came. */
        static findPath(nodes, sx, sz, tx, tz, hx, hz) {
            // Start must be able to leave; the goal only needs to be reachable
            // (a dead-end node is a fine destination, e.g. a cul-de-sac).
            // Direction-aware start: when moving, prefer the road ahead.
            let s = (hx !== undefined && hz !== undefined)
                ? this.nearestStart(nodes, sx, sz, hx, hz)
                : this.nearestNode(nodes, sx, sz, false);
            if (s && (!s.out || !s.out.length)) s = this.nearestNode(nodes, sx, sz, true);
            const t = this.nearestNode(nodes, tx, tz, false);
            if (!s || !t) return null;
            if (s.id === t.id) return [{ x: s.x, z: s.z }];
            const n = nodes.length;
            const g = new Float64Array(n).fill(Infinity);
            const came = new Int32Array(n).fill(-1);
            const closed = new Uint8Array(n);
            // Binary min-heap of [f, id].
            const hf = [], hi = [];
            const push = (f, id) => {
                hf.push(f); hi.push(id);
                let c = hf.length - 1;
                while (c > 0) {
                    const par = (c - 1) >> 1;
                    if (hf[par] <= hf[c]) break;
                    const tf = hf[par]; hf[par] = hf[c]; hf[c] = tf;
                    const ti = hi[par]; hi[par] = hi[c]; hi[c] = ti;
                    c = par;
                }
            };
            const pop = () => {
                const top = hi[0];
                const lf = hf.pop(), li = hi.pop();
                if (hf.length) {
                    hf[0] = lf; hi[0] = li;
                    let c = 0;
                    for (;;) {
                        const l = c * 2 + 1, r = l + 1;
                        let m = c;
                        if (l < hf.length && hf[l] < hf[m]) m = l;
                        if (r < hf.length && hf[r] < hf[m]) m = r;
                        if (m === c) break;
                        const tf = hf[m]; hf[m] = hf[c]; hf[c] = tf;
                        const ti = hi[m]; hi[m] = hi[c]; hi[c] = ti;
                        c = m;
                    }
                }
                return top;
            };
            const H = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) / 14;
            g[s.id] = 0;
            push(H(s, t), s.id);
            let found = false, guard = 0;
            while (hf.length && guard++ < 20000) {
                const cur = pop();
                if (closed[cur]) continue;
                closed[cur] = 1;
                if (cur === t.id) { found = true; break; }
                const cn = nodes[cur];
                for (const e of cn.out) {
                    // Prefer natural routes: penalize sharp turns and U-turns
                    // so the GPS doesn't zigzag across intersections when a
                    // calmer street exists. came[cur] is final at pop time.
                    let turn = 0;
                    const pc = came[cur];
                    if (pc !== -1) {
                        const pn = nodes[pc];
                        const tn = nodes[e.to];
                        const v1x = cn.x - pn.x, v1z = cn.z - pn.z;
                        const v2x = tn.x - cn.x, v2z = tn.z - cn.z;
                        const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
                        const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
                        if (dot < -0.3) turn = 9;
                        else if (dot < 0.45) turn = 2.5;
                    }
                    const w = e.length / (e.speed || 10) + turn;
                    const ng = g[cur] + w;
                    if (ng < g[e.to]) {
                        g[e.to] = ng;
                        came[e.to] = cur;
                        const tn = nodes[e.to];
                        push(ng + H(tn, t), e.to);
                    }
                }
            }
            if (!found) return null;
            const path = [];
            let cur = t.id;
            while (cur !== -1) { path.push({ x: nodes[cur].x, z: nodes[cur].z }); cur = came[cur]; }
            path.reverse();
            return path;
        }

        /** Nearest node with out-edges, biased toward (hx,hz) travel. */
        static nearestStart(nodes, x, z, hx, hz) {
            let best = null, bs = Infinity;
            const useH = (hx * hx + hz * hz) > 1e-6;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (!n.out || !n.out.length) continue;
                const dx = n.x - x, dz = n.z - z;
                const d = Math.sqrt(dx * dx + dz * dz);
                let score = d;
                if (useH && d > 1e-3) score = d - 28 * ((dx * hx + dz * hz) / d);
                if (score < bs) { bs = score; best = n; }
            }
            return best;
        }

        /** Collapse near-collinear middles so the line holds corners only. */
        static simplify(pts) {
            if (!pts || pts.length < 3) return pts;
            const out = [pts[0]];
            for (let i = 1; i + 1 < pts.length; i++) {
                const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
                const abx = b.x - a.x, abz = b.z - a.z;
                const bcx = c.x - b.x, bcz = c.z - b.z;
                const l1 = Math.hypot(abx, abz), l2 = Math.hypot(bcx, bcz);
                if (l1 < 1e-6 || l2 < 1e-6) continue; // drop degenerate
                const dot = (abx * bcx + abz * bcz) / (l1 * l2);
                const cross = Math.abs(abx * bcz - abz * bcx) / (l1 * l2);
                if (dot > 0.995 && cross < 0.08) continue;
                out.push(b);
            }
            out.push(pts[pts.length - 1]);
            return out;
        }

        /** Chaikin corner-cutting on the simplified path so the GPS ribbon
         *  draws as smooth curves instead of hard polylines. Endpoints and
         *  sharp (>~60°) maneuver corners are preserved exactly. */
        static smoothPath(pts, passes) {
            if (!pts || pts.length < 3) return pts;
            let cur = pts.slice();
            const n = clamp(Math.max(0, passes | 0) || 2, 1, 3);
            for (let p = 0; p < n; p++) {
                const out = [cur[0]];
                for (let i = 0; i + 1 < cur.length; i++) {
                    const a = cur[i], b = cur[i + 1];
                    const q = { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 };
                    const r = { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 };
                    // Keep the original joint vertex only at real maneuver
                    // corners or the final endpoint; straights get cut smooth.
                    let keepJoint = (i + 2 >= cur.length);
                    if (!keepJoint && i > 0) {
                        const p0 = cur[i - 1], p2 = cur[i + 2] || b;
                        const v1x = a.x - p0.x, v1z = a.z - p0.z;
                        const v2x = p2.x - b.x, v2z = p2.z - b.z;
                        const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
                        const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
                        if (dot < 0.5) keepJoint = true;
                    } else if (!keepJoint && i === 0) {
                        keepJoint = false;
                    }
                    if (keepJoint) {
                        out.push(q);
                        out.push(b);
                    } else {
                        out.push(q);
                        out.push(r);
                    }
                }
                out.push(cur[cur.length - 1]);
                // Dedupe near-identical joints, pin endpoints exactly.
                const ded = [cur[0]];
                for (let i = 1; i < out.length; i++) {
                    const l = ded[ded.length - 1];
                    if (Math.hypot(out[i].x - l.x, out[i].z - l.z) > 0.5) ded.push(out[i]);
                }
                ded[0] = cur[0];
                ded[ded.length - 1] = cur[cur.length - 1];
                cur = ded;
                if (cur.length > 220) break; // safety cap
            }
            return cur;
        }

        /** Nearest segment in pts[0..maxSeg): {j, t (unclamped), lat} or null. */
        static projectAhead(pts, x, z, maxSeg) {
            let bj = -1, bt = 0, bl = Infinity;
            const m = Math.min(maxSeg || 6, pts.length - 1);
            for (let j = 0; j < m; j++) {
                const ax = pts[j].x, az = pts[j].z;
                const dx = pts[j + 1].x - ax, dz = pts[j + 1].z - az;
                const L2 = dx * dx + dz * dz;
                if (L2 < 1e-6) continue;
                const t = ((x - ax) * dx + (z - az) * dz) / L2;
                const tc = t < 0 ? 0 : t > 1 ? 1 : t;
                const ex = ax + dx * tc - x, ez = az + dz * tc - z;
                const l = ex * ex + ez * ez;
                if (l < bl) { bl = l; bj = j; bt = t; }
            }
            return bj < 0 ? null : { j: bj, t: bt, lat: Math.sqrt(bl) };
        }

        /** Shortest distance from (x,z) to a polyline [{x,z}...]. */
        static distToPath(pts, x, z) {
            let bd = Infinity;
            for (let i = 0; i + 1 < pts.length; i++) {
                const ax = pts[i].x, az = pts[i].z;
                const dx = pts[i + 1].x - ax, dz = pts[i + 1].z - az;
                const L2 = dx * dx + dz * dz || 1;
                const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
                const px = ax + dx * t - x, pz = az + dz * t - z;
                const d = px * px + pz * pz;
                if (d < bd) bd = d;
            }
            return Math.sqrt(bd);
        }
    }
