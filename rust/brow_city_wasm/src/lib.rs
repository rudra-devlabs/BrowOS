
// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
#[inline(always)]
fn abs(x: f32) -> f32 {
    x.abs()
}

#[inline(always)]
fn max(a: f32, b: f32) -> f32 {
    if a > b { a } else { b }
}

#[inline(always)]
fn min(a: f32, b: f32) -> f32 {
    if a < b { a } else { b }
}

#[inline(always)]
fn clamp(val: f32, low: f32, high: f32) -> f32 {
    if val < low { low } else if val > high { high } else { val }
}

// ---------------------------------------------------------------------------
// Static Colliders Broadphase & Narrowphase
// ---------------------------------------------------------------------------
const MAX_COLLIDERS: usize = 8192;
const GRID_CELL: f32 = 16.0;
const GRID_BUCKETS: usize = 2048;
const MAX_GRID_ENTRIES: usize = 65536;

#[derive(Clone, Copy)]
struct Collider {
    x: f32,
    y: f32,
    z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
}

static mut COLLIDERS: [Collider; MAX_COLLIDERS] = [Collider { x: 0.0, y: 0.0, z: 0.0, sx: 0.0, sy: 0.0, sz: 0.0 }; MAX_COLLIDERS];
static mut NUM_COLLIDERS: usize = 0;

static mut GRID_HEAD: [u32; GRID_BUCKETS] = [0; GRID_BUCKETS];
static mut ENTRY_COLLIDER: [u16; MAX_GRID_ENTRIES] = [0; MAX_GRID_ENTRIES];
static mut ENTRY_NEXT: [u32; MAX_GRID_ENTRIES] = [0; MAX_GRID_ENTRIES];
static mut ENTRY_COUNT: usize = 0;

static mut QUERY_RESULTS: [u32; 1024] = [0; 1024];
static mut QUERY_COUNT: usize = 0;

static mut OUT_POS_X: f32 = 0.0;
static mut OUT_POS_Z: f32 = 0.0;

#[inline(always)]
fn cell_hash(gx: i32, gz: i32) -> usize {
    let u = (gx.wrapping_mul(73856093) ^ gz.wrapping_mul(19349663)) as usize;
    u & (GRID_BUCKETS - 1)
}

#[no_mangle]
pub extern "C" fn reset() {
    unsafe {
        NUM_COLLIDERS = 0;
        ENTRY_COUNT = 0;
        for i in 0..GRID_BUCKETS {
            GRID_HEAD[i] = 0;
        }
        QUERY_COUNT = 0;
    }
}

#[no_mangle]
pub extern "C" fn set_num_colliders(num: u32) {
    unsafe {
        NUM_COLLIDERS = if (num as usize) <= MAX_COLLIDERS { num as usize } else { MAX_COLLIDERS };
    }
}

#[no_mangle]
pub extern "C" fn set_collider(id: u32, x: f32, y: f32, z: f32, sx: f32, sy: f32, sz: f32) {
    unsafe {
        let i = id as usize;
        if i < MAX_COLLIDERS {
            COLLIDERS[i] = Collider { x, y, z, sx, sy, sz };
        }
    }
}

#[no_mangle]
pub extern "C" fn build_grid() {
    unsafe {
        ENTRY_COUNT = 0;
        for i in 0..GRID_BUCKETS {
            GRID_HEAD[i] = 0;
        }

        let num = NUM_COLLIDERS;
        for i in 0..num {
            let c = COLLIDERS[i];
            let x0 = ((c.x - c.sx * 0.5) / GRID_CELL) as i32;
            let x1 = ((c.x + c.sx * 0.5) / GRID_CELL) as i32;
            let z0 = ((c.z - c.sz * 0.5) / GRID_CELL) as i32;
            let z1 = ((c.z + c.sz * 0.5) / GRID_CELL) as i32;

            for gx in x0..=x1 {
                for gz in z0..=z1 {
                    // Entry index is 1-based (1..MAX_GRID_ENTRIES)
                    if ENTRY_COUNT + 1 >= MAX_GRID_ENTRIES {
                        return;
                    }
                    ENTRY_COUNT += 1;
                    let bucket = cell_hash(gx, gz);
                    let entry_idx = ENTRY_COUNT;
                    ENTRY_COLLIDER[entry_idx] = i as u16;
                    ENTRY_NEXT[entry_idx] = GRID_HEAD[bucket];
                    GRID_HEAD[bucket] = entry_idx as u32;
                }
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn query_circle(x: f32, z: f32, r: f32) -> u32 {
    unsafe {
        QUERY_COUNT = 0;
        let x0 = ((x - r) / GRID_CELL) as i32;
        let x1 = ((x + r) / GRID_CELL) as i32;
        let z0 = ((z - r) / GRID_CELL) as i32;
        let z1 = ((z + r) / GRID_CELL) as i32;

        for gx in x0..=x1 {
            for gz in z0..=z1 {
                let bucket = cell_hash(gx, gz);
                let mut curr = GRID_HEAD[bucket];
                while curr > 0 {
                    let col_id = ENTRY_COLLIDER[curr as usize] as u32;
                    // Deduplicate
                    let mut found = false;
                    for k in 0..QUERY_COUNT {
                        if QUERY_RESULTS[k] == col_id {
                            found = true;
                            break;
                        }
                    }
                    if !found && QUERY_COUNT < QUERY_RESULTS.len() {
                        QUERY_RESULTS[QUERY_COUNT] = col_id;
                        QUERY_COUNT += 1;
                    }
                    curr = ENTRY_NEXT[curr as usize];
                }
            }
        }
        QUERY_COUNT as u32
    }
}

#[no_mangle]
pub extern "C" fn get_result_count() -> u32 {
    unsafe { QUERY_COUNT as u32 }
}

#[no_mangle]
pub extern "C" fn get_result(i: u32) -> u32 {
    unsafe {
        let idx = i as usize;
        if idx < QUERY_COUNT { QUERY_RESULTS[idx] } else { 0 }
    }
}

#[no_mangle]
pub extern "C" fn get_out_pos_x() -> f32 {
    unsafe { OUT_POS_X }
}

#[no_mangle]
pub extern "C" fn get_out_pos_z() -> f32 {
    unsafe { OUT_POS_Z }
}

#[no_mangle]
pub extern "C" fn resolve_circle(mut px: f32, mut pz: f32, r: f32, y_bottom: f32, y_top: f32) -> i32 {
    unsafe {
        let mut deepest_id: i32 = -1;
        let mut deepest_overlap: f32 = 0.0;

        // Perform 2 iteration passes same as JS narrowphase
        for _iter in 0..2 {
            let count = query_circle(px, pz, r) as usize;
            for i in 0..count {
                let id = QUERY_RESULTS[i] as usize;
                let c = COLLIDERS[id];

                // Y-overlap test
                let c_bottom = c.y - c.sy * 0.5;
                let c_top = c.y + c.sy * 0.5;
                if y_top <= c_bottom || y_bottom >= c_top {
                    continue;
                }

                let hx = c.sx * 0.5;
                let hz = c.sz * 0.5;
                let cx = clamp(px, c.x - hx, c.x + hx);
                let cz = clamp(pz, c.z - hz, c.z + hz);

                let dx = px - cx;
                let dz = pz - cz;
                let d2 = dx * dx + dz * dz;

                if d2 < r * r {
                    let overlap: f32;
                    if d2 > 1e-6 {
                        let d = d2.sqrt();
                        overlap = r - d;
                        let push = overlap / d;
                        px += dx * push;
                        pz += dz * push;
                    } else {
                        // Center is inside box: push out along minimal axis
                        let left = (px - (c.x - hx)).abs();
                        let right = ((c.x + hx) - px).abs();
                        let back = (pz - (c.z - hz)).abs();
                        let front = ((c.z + hz) - pz).abs();

                        if left < right && left < back && left < front {
                            px = c.x - hx - r;
                            overlap = left + r;
                        } else if right < back && right < front {
                            px = c.x + hx + r;
                            overlap = right + r;
                        } else if back < front {
                            pz = c.z - hz - r;
                            overlap = back + r;
                        } else {
                            pz = c.z + hz + r;
                            overlap = front + r;
                        }
                    }

                    if overlap > deepest_overlap {
                        deepest_overlap = overlap;
                        deepest_id = id as i32;
                    }
                }
            }
        }

        OUT_POS_X = px;
        OUT_POS_Z = pz;
        deepest_id
    }
}

#[no_mangle]
pub extern "C" fn ground_at(x: f32, z: f32, from_y: f32, step: f32) -> f32 {
    unsafe {
        let count = query_circle(x, z, 0.4) as usize;
        let mut best: f32 = -999.0;
        let limit = from_y + step;

        for i in 0..count {
            let id = QUERY_RESULTS[i] as usize;
            let c = COLLIDERS[id];
            let top = c.y + c.sy * 0.5;
            if top <= limit && top > best {
                let hx = c.sx * 0.5;
                let hz = c.sz * 0.5;
                if x >= c.x - hx && x <= c.x + hx && z >= c.z - hz && z <= c.z + hz {
                    best = top;
                }
            }
        }
        best
    }
}

// ---------------------------------------------------------------------------
// Batch Pedestrian Separation & Solvers
// ---------------------------------------------------------------------------
const MAX_PEDS: usize = 128;

static mut PED_X: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_Z: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_VX: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_VZ: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_SEP_X: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_SEP_Z: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_Y: [f32; MAX_PEDS] = [0.0; MAX_PEDS];
static mut PED_ACTIVE: [u8; MAX_PEDS] = [0; MAX_PEDS];

#[no_mangle]
pub extern "C" fn get_ped_x_ptr() -> *mut f32 { unsafe { PED_X.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_z_ptr() -> *mut f32 { unsafe { PED_Z.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_vx_ptr() -> *mut f32 { unsafe { PED_VX.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_vz_ptr() -> *mut f32 { unsafe { PED_VZ.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_sep_x_ptr() -> *mut f32 { unsafe { PED_SEP_X.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_sep_z_ptr() -> *mut f32 { unsafe { PED_SEP_Z.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_y_ptr() -> *mut f32 { unsafe { PED_Y.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_ped_active_ptr() -> *mut u8 { unsafe { PED_ACTIVE.as_mut_ptr() } }

#[no_mangle]
pub extern "C" fn batch_solve_ped_separation(count: u32, px: f32, pz: f32) {
    unsafe {
        let n = if (count as usize) <= MAX_PEDS { count as usize } else { MAX_PEDS };
        const R: f32 = 1.45;
        const R2: f32 = R * R;
        const CS: f32 = 0.8660254; // cos(30 deg)
        const SN: f32 = 0.5;       // sin(30 deg)

        for i in 0..n {
            PED_SEP_X[i] = 0.0;
            PED_SEP_Z[i] = 0.0;
        }

        // Pairwise pedestrian repulsion with antisymmetric deflection
        for i in 0..n {
            if PED_ACTIVE[i] == 0 { continue; }
            let xi = PED_X[i];
            let zi = PED_Z[i];

            for j in (i + 1)..n {
                if PED_ACTIVE[j] == 0 { continue; }
                let dx = xi - PED_X[j];
                let dz = zi - PED_Z[j];
                let d2 = dx * dx + dz * dz;

                if d2 <= R2 && d2 >= 1e-6 {
                    let d = d2.sqrt();
                    let f = (R - d) / R / d;
                    let ux = dx * f;
                    let uz = dz * f;
                    let rx = ux * CS - uz * SN;
                    let rz = ux * SN + uz * CS;

                    PED_SEP_X[i] += rx;
                    PED_SEP_Z[i] += rz;
                    PED_SEP_X[j] -= rx;
                    PED_SEP_Z[j] -= rz;
                }
            }

            // Repulsion from player
            let pdx = xi - px;
            let pdz = zi - pz;
            let pd2 = pdx * pdx + pdz * pdz;
            if pd2 < 4.4 && pd2 > 1e-6 {
                let d = pd2.sqrt();
                let f = (2.1 - d) / 2.1 / d * 1.7;
                PED_SEP_X[i] += pdx * f;
                PED_SEP_Z[i] += pdz * f;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Batch Vehicle Separation & Solvers
// ---------------------------------------------------------------------------
const MAX_VEHICLES: usize = 128;

static mut VEH_X: [f32; MAX_VEHICLES] = [0.0; MAX_VEHICLES];
static mut VEH_Z: [f32; MAX_VEHICLES] = [0.0; MAX_VEHICLES];
static mut VEH_SPEED: [f32; MAX_VEHICLES] = [0.0; MAX_VEHICLES];
static mut VEH_LENGTH: [f32; MAX_VEHICLES] = [0.0; MAX_VEHICLES];
static mut VEH_HP: [f32; MAX_VEHICLES] = [0.0; MAX_VEHICLES];
static mut VEH_ACTIVE: [u8; MAX_VEHICLES] = [0; MAX_VEHICLES];

#[no_mangle]
pub extern "C" fn get_veh_x_ptr() -> *mut f32 { unsafe { VEH_X.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_veh_z_ptr() -> *mut f32 { unsafe { VEH_Z.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_veh_speed_ptr() -> *mut f32 { unsafe { VEH_SPEED.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_veh_length_ptr() -> *mut f32 { unsafe { VEH_LENGTH.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_veh_hp_ptr() -> *mut f32 { unsafe { VEH_HP.as_mut_ptr() } }
#[no_mangle]
pub extern "C" fn get_veh_active_ptr() -> *mut u8 { unsafe { VEH_ACTIVE.as_mut_ptr() } }

#[no_mangle]
pub extern "C" fn batch_solve_vehicle_separation(count: u32) {
    unsafe {
        let n = if (count as usize) <= MAX_VEHICLES { count as usize } else { MAX_VEHICLES };

        for i in 0..n {
            if VEH_ACTIVE[i] == 0 { continue; }
            let xi = VEH_X[i];
            let zi = VEH_Z[i];
            let len_i = VEH_LENGTH[i];

            for j in (i + 1)..n {
                if VEH_ACTIVE[j] == 0 { continue; }
                let dx = VEH_X[j] - xi;
                let dz = VEH_Z[j] - zi;
                let rr = (len_i + VEH_LENGTH[j]) * 0.32;
                let d2 = dx * dx + dz * dz;

                if d2 > rr * rr || d2 < 1e-6 { continue; }
                let d = d2.sqrt();
                let push = (rr - d) * 0.5;
                let ux = dx / d;
                let uz = dz / d;

                VEH_X[i] -= ux * push;
                VEH_Z[i] -= uz * push;
                VEH_X[j] += ux * push;
                VEH_Z[j] += uz * push;

                let rel = abs(VEH_SPEED[i] - VEH_SPEED[j]);
                if rel > 8.0 {
                    VEH_HP[i] -= rel * 0.4;
                    VEH_HP[j] -= rel * 0.4;
                    let tmp = VEH_SPEED[i];
                    VEH_SPEED[i] = VEH_SPEED[j] * 0.6;
                    VEH_SPEED[j] = tmp * 0.6;
                }
            }
        }
    }
}
