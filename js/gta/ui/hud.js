    // ===========================================================================
    // HUD — DOM stats, wanted stars, toasts, rotating circular minimap
    // ===========================================================================
    class HudController {
        constructor(win) {
            this.win = win;
            this.hud = win.querySelector('#gta-hud');
            this.stars = win.querySelectorAll('#gta-wanted .star');
            this.minimap = win.querySelector('#gta-minimap-canvas');
            // Retina backing store: CSS stays 180px (apps.css), pixels are 2x
            // so rotated roads/landmarks stay sharp instead of upscaled blur.
            this.minimap.width = 360;
            this.minimap.height = 360;
            this.mm = this.minimap.getContext('2d');
            this.money = win.querySelector('#gta-money');
            this.healthFill = win.querySelector('#gta-health-fill');
            this.armorFill = win.querySelector('#gta-armor-fill');
            this.weapon = win.querySelector('#gta-weapon');
            this.vehiclePanel = win.querySelector('#gta-vehicle');
            this.vehicleSpeed = win.querySelector('#gta-vehicle-speed');
            this.vehicleName = win.querySelector('#gta-vehicle-name');
            this.vehicleFill = win.querySelector('#gta-vehicle-fill');
            this.vehicleGear = win.querySelector('#gta-vehicle-gear');
            this._vehShown = false;
            this.prompt = win.querySelector('#gta-prompt');
            this.reticle = win.querySelector('#gta-reticle');
            // Scope overlay: circular vignette + crosshair + live magnification.
            this.scopeEl = document.createElement('div');
            this.scopeEl.style.cssText = 'position:absolute;inset:0;display:none;pointer-events:none;' +
                'background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 22%, rgba(0,0,0,0.82) 40%);';
            this.scopeEl.innerHTML =
                '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
                'width:30px;height:30px;border:2px solid rgba(255,255,255,0.9);border-radius:50%;"></div>' +
                '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
                'width:2px;height:2px;background:#fff;border-radius:50%;"></div>' +
                '<div style="position:absolute;left:50%;bottom:16%;transform:translateX(-50%);' +
                'font:700 15px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8);">1x</div>';
            this._scopeZoomEl = this.scopeEl.lastElementChild;
            this.hud.appendChild(this.scopeEl);
            this.lockHint = win.querySelector('#gta-lockhint');
            this._lockShown = null;
            this._cache = {};
            this._mmT = 0;
            // Smoothed follow state — kills jitter when the player sprints/drives.
            this._smX = null; this._smZ = null; this._smYaw = null;
            // Smooth minimap camera: damped zoom + free-pan with inertia.
            this._mmZoomT = 1; this._mmZoom = 1;
            this._mmPanX = 0; this._mmPanZ = 0;
            this._mmPanTX = 0; this._mmPanTZ = 0;
            this._mmPanVX = 0; this._mmPanVZ = 0;
            this._mmFree = false; this._mmIdleT = 0;
            this._mmDrag = null;
            // Damage flash + toast stack (procedural, styled in apps.css).
            this.flashEl = document.createElement('div');
            this.flashEl.className = 'gta-flash';
            this.hud.appendChild(this.flashEl);
            this.toastBox = document.createElement('div');
            this.toastBox.className = 'gta-toasts';
            this.hud.appendChild(this.toastBox);
            // World-anchored speech. A fixed pool of five elements, recycled
            // oldest-first: a street full of people shouting must not create a
            // DOM node per line, and five on screen is already a crowd.
            this.barkBox = document.createElement('div');
            this.barkBox.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
            this.hud.appendChild(this.barkBox);
            this.barks = [];
            for (let i = 0; i < 5; i++) {
                const el = document.createElement('div');
                el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);' +
                    'white-space:nowrap;font:600 12px/1.2 system-ui,-apple-system,sans-serif;color:#fff;' +
                    'text-shadow:0 1px 3px rgba(0,0,0,0.9);background:rgba(12,18,28,0.62);' +
                    'border:1px solid rgba(255,255,255,0.16);border-radius:9px;padding:3px 8px;' +
                    'opacity:0;will-change:transform,opacity;';
                this.barkBox.appendChild(el);
                this.barks.push({ el, t: 0, x: 0, y: 0, z: 0 });
            }
            this._barkV = new THREE.Vector3();
            this._buildBigmap();
            // Clickable minimap: hud root ignores pointer events, the minimap
            // bubble re-enables them (see apps.css .gta-minimap).
            const bubble = win.querySelector('.gta-minimap');
            if (bubble) {
                bubble.title = 'Open map (M) · drag to pan · wheel to zoom · double-click re-centers';
                bubble.addEventListener('click', (e) => {
                    // A drag-pan ends with a click — don't pop the big map then.
                    if (this._mmDragMoved) { this._mmDragMoved = false; return; }
                    e.stopPropagation();
                    if (this._game) this.toggleBigmap(this._game);
                });
                // Smooth minimap zoom: wheel over the bubble (no page scroll).
                bubble.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const f = e.deltaY < 0 ? 1.18 : 0.85;
                    if (e.deltaMode === 1) {
                        this._mmZoomT = clamp(this._mmZoomT * (e.deltaY < 0 ? 1.35 : 0.74), 0.45, 3.2);
                    } else {
                        this._mmZoomT = clamp(this._mmZoomT * Math.pow(f, clamp(Math.abs(e.deltaY) / 50, 0.5, 2)), 0.45, 3.2);
                    }
                    this._mmIdleT = 0;
                }, { passive: false });
                // Smooth minimap pan: drag inside the circle, release to glide.
                // Double-click snaps back to follow mode.
                this.minimap.style.touchAction = 'none';
                bubble.addEventListener('pointerdown', (e) => {
                    if (e.button !== undefined && e.button !== 0) return;
                    e.stopPropagation();
                    try { bubble.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                    const r = this.minimap.getBoundingClientRect();
                    this._mmDrag = { id: e.pointerId, lx: e.clientX, ly: e.clientY, r };
                    this._mmDragMoved = false;
                    this._mmPanVX = 0; this._mmPanVZ = 0;
                });
                bubble.addEventListener('pointermove', (e) => {
                    if (!this._mmDrag || e.pointerId !== this._mmDrag.id) return;
                    const dxPx = e.clientX - this._mmDrag.lx, dyPx = e.clientY - this._mmDrag.ly;
                    this._mmDrag.lx = e.clientX; this._mmDrag.ly = e.clientY;
                    if (Math.abs(e.clientX) + Math.abs(e.clientY) > 0 && Math.hypot(dxPx, dyPx) > 2) this._mmDragMoved = true;
                    if (dxPx === 0 && dyPx === 0) return;
                    e.stopPropagation();
                    const rect = this._mmDrag.r || this.minimap.getBoundingClientRect();
                    const R = this.minimap.width / 2;
                    const view = this._mmView || 160;
                    // CSS px -> world meters (canvas backing store is 2x CSS).
                    const cssPerBack = (rect.width || 180) / this.minimap.width;
                    const mPerCssPx = view / (R * cssPerBack);
                    const yaw = this._smYaw || 0;
                    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
                    // Drag content with the cursor: world moves opposite the drag,
                    // rotated out of map space back into world space.
                    const fdx = -dxPx * mPerCssPx, fdy = -dyPx * mPerCssPx;
                    const wx = fdx * cy - fdy * sy, wz = fdx * sy + fdy * cy;
                    this._mmPanTX += wx; this._mmPanTZ += wz;
                    this._mmPanVX = this._mmPanVX * 0.7 + wx * 0.3;
                    this._mmPanVZ = this._mmPanVZ * 0.7 + wz * 0.3;
                    this._mmFree = true;
                    this._mmIdleT = 0;
                });
                const endDrag = (e) => {
                    if (!this._mmDrag || (e && e.pointerId !== this._mmDrag.id)) return;
                    this._mmDrag = null;
                    // Keep the release velocity so the map glides to a stop.
                    this._mmIdleT = 0;
                };
                bubble.addEventListener('pointerup', endDrag);
                bubble.addEventListener('pointercancel', endDrag);
                bubble.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this._mmDragMoved = false;
                    this._recenterMinimap();
                });
            }

            // In-game HUD clock displaying time of day
            this.clock = document.createElement('div');
            this.clock.className = 'gta-clock';
            this.clock.id = 'gta-clock';
            this.clock.style.cssText = 'position:absolute;top:16px;left:16px;padding:6px 12px;background:rgba(10,16,26,0.78);border:1px solid rgba(255,255,255,0.22);border-radius:10px;font:700 13px/1 system-ui,-apple-system,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.8);z-index:20;display:flex;align-items:center;gap:7px;backdrop-filter:blur(8px);box-shadow:0 4px 14px rgba(0,0,0,0.4);pointer-events:auto;cursor:pointer;user-select:none;';
            this.clock.title = 'Click or press [T] to advance time of day';
            this.clock.innerHTML = '<span id="gta-clock-icon" style="font-size:15px;">☀️</span> <span id="gta-clock-time" style="letter-spacing:0.5px;">09:30 AM</span>';
            this.hud.appendChild(this.clock);
            this.clock.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._game && this._game.dayNight) {
                    this._game.dayNight.advanceTime(3.0);
                    const t = this._game.dayNight.getTime();
                    const phase = t.hours >= 5 && t.hours < 9 ? 'Morning / Sunrise' :
                                  t.hours >= 9 && t.hours < 17 ? 'Day / Noon' :
                                  t.hours >= 17 && t.hours < 20 ? 'Sunset / Golden Hour' : 'Night';
                    this.toast(`Time: ${t.str} (${phase}) · [T] Cycle Time`, '#ffd54f');
                }
            });
        }

        setTime(hours, minutes, isDay) {
            if (!this.clock) return;
            const h12 = hours % 12 === 0 ? 12 : hours % 12;
            const ampm = hours < 12 ? 'AM' : 'PM';
            const mStr = minutes < 10 ? '0' + minutes : minutes;
            const icon = isDay ? (hours >= 17 && hours <= 19 ? '🌅' : '☀️') : '🌙';
            const timeStr = `${h12}:${mStr} ${ampm}`;
            const iconEl = this.clock.querySelector('#gta-clock-icon');
            const timeEl = this.clock.querySelector('#gta-clock-time');
            if (iconEl && iconEl.textContent !== icon) iconEl.textContent = icon;
            if (timeEl && timeEl.textContent !== timeStr) timeEl.textContent = timeStr;
        }

        show(v) { this.hud.style.display = v ? 'block' : 'none'; }

        _set(el, key, val) {
            if (this._cache[key] === val) return;
            this._cache[key] = val;
            el.textContent = val;
        }

        setMoney(val) {
            this._set(this.money, 'money', '$' + val);
        }

        setStats(p) {
            this._set(this.money, 'money', '$' + p.money);
            this.healthFill.style.width = clamp(p.health, 0, 100) + '%';
            this.armorFill.style.width = clamp(p.armor, 0, 100) + '%';
            let wl = 'FIST';
            if (p.weapon === 'bat') wl = 'BASEBALL BAT';
            else if (p.weapon === 'pistol') wl = 'PISTOL · ' + (typeof p.ammo === 'object' ? (p.ammo.pistol || 0) : p.ammo);
            else if (p.weapon === 'shotgun') wl = 'SHOTGUN · ' + (typeof p.ammo === 'object' ? (p.ammo.shotgun || 0) : 0);
            else if (p.weapon === 'smg') wl = 'SMG · ' + (typeof p.ammo === 'object' ? (p.ammo.smg || 0) : 0);
            else if (p.weapon === 'rifle') wl = 'RIFLE · ' + (typeof p.ammo === 'object' ? (p.ammo.rifle || 0) : 0);
            else if (p.weapon === 'sniper') wl = 'SNIPER · ' + (typeof p.ammo === 'object' ? (p.ammo.sniper || 0) : 0);
            this._set(this.weapon, 'weapon', wl);
        }

        setVehicle(v) {
            if (!v) {
                if (this._vehShown) { this._vehShown = false; this.vehiclePanel.style.display = 'none'; }
                return;
            }
            if (!this._vehShown) { this._vehShown = true; this.vehiclePanel.style.display = 'flex'; }
            this._set(this.vehicleSpeed, 'vspeed', String(Math.round(Math.abs(v.speed || 0) * 2.237)));
            const max = v.maxHp || (v.spec && v.spec.hp) || 100;
            const frac = Math.max(0, (v.hp || 0) / max);
            this.vehicleFill.style.width = (frac * 100).toFixed(1) + '%';
            this.vehicleFill.classList.toggle('low', frac < 0.35);
            this._set(this.vehicleName, 'vname', ((v.spec && v.spec.name) || 'VEHICLE').toUpperCase());
            if (this.vehicleGear) {
                const isAuto = (v.gearMode === 'auto' || v.gear === 5);
                const gNum = v.currentGear || (isAuto ? 1 : v.gear) || 1;
                const text = isAuto ? ('A' + gNum) : ('M' + (v.gear || gNum));
                this._set(this.vehicleGear, 'vgear', text);
                this.vehicleGear.classList.toggle('manual', !isAuto);
                this.vehicleGear.title = isAuto ? 'Automatic Transmission [Key 5] (Dynamic 1-4)' : `Manual Gear ${v.gear || gNum} [Keys 1-4]`;
            }
        }

        setWanted(n) {
            if (this._cache.wanted === n) return;
            this._cache.wanted = n;
            for (let i = 0; i < this.stars.length; i++) {
                this.stars[i].classList.toggle('on', i < n);
            }
        }

        setPrompt(text) { this._set(this.prompt, 'prompt', text || ''); }
        setReticle(aiming) { this.reticle.style.display = aiming ? 'block' : 'none'; }
        setScope(scoped, zoom) {
            if (!scoped) { this.scopeEl.style.display = 'none'; return; }
            this.scopeEl.style.display = 'block';
            this._scopeZoomEl.textContent = (Math.round(zoom * 10) / 10) + 'x';
        }

        setLockHint(show) {
            if (this._lockShown === show) return;
            this._lockShown = show;
            if (this.lockHint) this.lockHint.style.display = show ? 'block' : 'none';
        }

        flash() {
            this.flashEl.classList.remove('hit');
            void this.flashEl.offsetWidth; // restart the CSS animation
            this.flashEl.classList.add('hit');
        }

        toast(text, color) {
            const el = document.createElement('div');
            el.className = 'gta-toast';
            el.textContent = text;
            if (color) el.style.color = color;
            this.toastBox.appendChild(el);
            setTimeout(() => { el.classList.add('out'); }, 2100);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
            while (this.toastBox.children.length > 4) this.toastBox.removeChild(this.toastBox.firstChild);
        }

        /**
         * A line of speech pinned to a world point. Takes the oldest slot when
         * the pool is full, so the newest shout always gets shown.
         */
        bark(text, x, y, z, color) {
            let b = null, oldest = 1e9;
            for (const c of this.barks) {
                if (c.t <= 0) { b = c; break; }
                if (c.t < oldest) { oldest = c.t; b = c; }
            }
            if (!b) return;
            b.t = 2.4; b.x = x; b.y = y; b.z = z;
            if (b.el.textContent !== text) b.el.textContent = text;
            b.el.style.color = color || '#fff';
        }

        /** Project the live barks to screen space. Nothing allocated per frame. */
        updateBarks(dt, camera) {
            if (!camera || !this.barks) return;
            const w = this.hud.clientWidth, h = this.hud.clientHeight;
            const v = this._barkV;
            for (const b of this.barks) {
                if (b.t <= 0) continue;
                b.t -= dt;
                if (b.t <= 0) { b.el.style.opacity = '0'; continue; }
                v.set(b.x, b.y, b.z);
                v.project(camera);
                if (v.z > 1) { b.el.style.opacity = '0'; continue; }
                const sx = (v.x * 0.5 + 0.5) * w;
                const sy = (1 - (v.y * 0.5 + 0.5)) * h;
                if (sx < -90 || sx > w + 90 || sy < -50 || sy > h + 50) { b.el.style.opacity = '0'; continue; }
                const a = b.t > 2.1 ? (2.4 - b.t) / 0.3 : Math.min(1, b.t / 0.45);
                b.el.style.opacity = a.toFixed(2);
                b.el.style.transform = 'translate(-50%,-100%) translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
            }
        }

        showGunShopModal(shop, onBuy, onClose) {
            this.closeGunShopModal();
            const modal = document.createElement('div');
            modal.className = 'gta-gunshop-modal';
            modal.style.cssText = 'position:absolute;inset:0;background:rgba(8,12,18,0.88);backdrop-filter:blur(8px);z-index:250;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;';

            const card = document.createElement('div');
            card.style.cssText = 'background:#131822;border:1px solid #323b4d;border-radius:12px;width:min(620px,94vw);max-height:88vh;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.7);display:flex;flex-direction:column;';

            const head = document.createElement('div');
            head.style.cssText = 'background:#b31919;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #ff3b30;';
            head.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:26px;">🔫</span>
                    <div>
                        <div style="font-size:16px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">AMMU-NATION · ${shop.name}</div>
                        <div style="font-size:12px;color:#ffebeb;font-weight:500;">Licensed Tactical Firearms & Body Armor</div>
                    </div>
                </div>
                <button id="gta-gunshop-close" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;border-radius:4px;">✕</button>
            `;
            card.appendChild(head);

            const balanceBar = document.createElement('div');
            balanceBar.style.cssText = 'background:#1a2230;padding:10px 20px;font-size:13px;color:#a0b2c6;border-bottom:1px solid #283547;display:flex;align-items:center;justify-content:space-between;';
            const curMoney = (this._game && this._game.player) ? this._game.player.money : 0;
            balanceBar.innerHTML = `<span>Available Funds: <b id="gta-gunshop-funds" style="color:#39ff88;">${curMoney}</b></span><span style="color:#788ca2;">Press [Esc] to exit</span>`;
            card.appendChild(balanceBar);

            const list = document.createElement('div');
            list.style.cssText = 'padding:14px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:10px;max-height:58vh;';

            const CATALOG = [
                { id: 'bat', name: 'Baseball Bat', type: 'melee', price: 50, icon: '🏏', desc: 'Heavy solid wood melee weapon. Crushing blunt damage.' },
                { id: 'pistol', name: '9mm Service Pistol', type: 'firearm', price: 250, ammo: 30, icon: '🔫', desc: 'Reliable sidearm. High accuracy, 30 rounds included.' },
                { id: 'shotgun', name: 'Pump-Action Shotgun', type: 'firearm', price: 800, ammo: 20, icon: '💥', desc: 'Deadly close-quarters spread. 20 buckshot shells.' },
                { id: 'smg', name: 'Micro-SMG', type: 'firearm', price: 1200, ammo: 90, icon: '⚡', desc: 'High cyclic rate of fire. 90 rounds included.' },
                { id: 'rifle', name: 'Assault Rifle', type: 'firearm', price: 3000, ammo: 120, icon: '🎯', desc: 'Military standard automatic rifle. 120 high-velocity rounds.' },
                { id: 'sniper', name: 'Heavy Sniper Rifle', type: 'firearm', price: 5000, ammo: 30, icon: '🔭', desc: 'Long-range precision rifle. Extreme stopping power.' },
                { id: 'armor', name: 'Kevlar Body Armor', type: 'armor', price: 500, icon: '🛡️', desc: 'Reinforced ballistic vest. Sets Armor to 100% protection.' },
                { id: 'ammo_pistol', name: '9mm Ammo Pack (+60)', type: 'ammo', price: 100, weapon: 'pistol', ammo: 60, icon: '📦', desc: '60 extra rounds for 9mm Pistol & SMG.' },
                { id: 'ammo_shotgun', name: 'Shotgun Shells (+30)', type: 'ammo', price: 150, weapon: 'shotgun', ammo: 30, icon: '📦', desc: '30 heavy 12-gauge buckshot shells.' },
                { id: 'ammo_rifle', name: 'Rifle Rounds (+120)', type: 'ammo', price: 250, weapon: 'rifle', ammo: 120, icon: '📦', desc: '120 full-metal jacket 5.56mm rounds.' },
                { id: 'ammo_sniper', name: 'Sniper Rounds (+30)', type: 'ammo', price: 400, weapon: 'sniper', ammo: 30, icon: '📦', desc: '30 match-grade .50 cal sniper rounds.' },
            ];

            const renderItems = () => {
                list.innerHTML = '';
                const p = this._game && this._game.player;
                const pCash = p ? p.money : 0;
                const fundsEl = card.querySelector('#gta-gunshop-funds');
                if (fundsEl) fundsEl.textContent = '$' + pCash;

                for (const item of CATALOG) {
                    const row = document.createElement('div');
                    row.style.cssText = 'background:#1a2332;border:1px solid #2e3d52;border-radius:8px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;transition:all 0.15s;';
                    
                    const canAfford = pCash >= item.price;
                    row.innerHTML = `
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <span style="font-size:24px;background:#111722;padding:6px;border-radius:6px;">${item.icon}</span>
                            <div style="flex:1;">
                                <div style="font-weight:700;font-size:14px;color:#fff;">${item.name}</div>
                                <div style="font-size:11px;color:#8ba3bc;margin-top:2px;">${item.desc}</div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid #253346;padding-top:8px;margin-top:4px;">
                            <span style="font-weight:800;font-size:14px;color:#ffd24b;">${item.price}</span>
                            <button class="gta-buy-btn" style="background:${canAfford ? '#b31919' : '#333e50'};color:${canAfford ? '#fff' : '#718298'};border:none;padding:6px 14px;border-radius:6px;font-weight:700;font-size:12px;cursor:${canAfford ? 'pointer' : 'not-allowed'};transition:background 0.2s;">
                                ${canAfford ? 'PURCHASE' : 'NEED FUNDS'}
                            </button>
                        </div>
                    `;

                    const btn = row.querySelector('.gta-buy-btn');
                    if (canAfford) {
                        btn.onclick = () => {
                            if (onBuy) onBuy(item);
                            renderItems();
                        };
                        btn.onmouseover = () => btn.style.background = '#e62424';
                        btn.onmouseout = () => btn.style.background = '#b31919';
                    }
                    list.appendChild(row);
                }
            };
            renderItems();
            card.appendChild(list);

            modal.appendChild(card);
            this.win.appendChild(modal);
            this._gunShopModal = modal;

            const closeBtn = card.querySelector('#gta-gunshop-close');
            if (closeBtn) closeBtn.onclick = () => this.closeGunShopModal();

            modal.onclick = (e) => {
                if (e.target === modal) this.closeGunShopModal();
            };

            this._gunShopKeyHandler = (e) => {
                if (e.code === 'Escape') this.closeGunShopModal();
            };
            window.addEventListener('keydown', this._gunShopKeyHandler);
            this._gunShopOnClose = onClose;
        }

        closeGunShopModal() {
            if (this._gunShopModal && this._gunShopModal.parentNode) {
                this._gunShopModal.parentNode.removeChild(this._gunShopModal);
            }
            this._gunShopModal = null;
            if (this._gunShopKeyHandler) {
                window.removeEventListener('keydown', this._gunShopKeyHandler);
                this._gunShopKeyHandler = null;
            }
            if (this._gunShopOnClose) {
                const cb = this._gunShopOnClose;
                this._gunShopOnClose = null;
                cb();
            }
        }

        showFoodShopModal(shop, onEat, onClose) {
            this.closeFoodShopModal();
            const modal = document.createElement('div');
            modal.className = 'gta-food-modal';
            modal.style.cssText = 'position:absolute;inset:0;background:rgba(8,12,18,0.88);backdrop-filter:blur(8px);z-index:250;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;';

            const card = document.createElement('div');
            card.style.cssText = 'background:#141b24;border:1px solid #364456;border-radius:12px;width:min(580px,94vw);max-height:88vh;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.7);display:flex;flex-direction:column;';

            const isPizza = (shop.type === 'pizza') || (shop.id && shop.id.includes('midtown'));
            const isCafe = (shop.type === 'cafe') || (shop.id && shop.id.includes('bk'));
            const isCart = (shop.type === 'cart') || (shop.name && shop.name.includes('Cart'));
            const headerCol = isPizza ? '#9e2a1b' : (isCafe ? '#8a5320' : (isCart ? '#b87314' : '#1f5f9e'));
            const headerBorder = isPizza ? '#ff4b3e' : (isCafe ? '#ffa940' : (isCart ? '#ffbb24' : '#3994ff'));
            const shopIcon = shop.icon || (isPizza ? '🍕' : (isCafe ? '☕' : (isCart ? '🌭' : '🍔')));

            const head = document.createElement('div');
            head.style.cssText = `background:${headerCol};padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid ${headerBorder};`;
            head.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:26px;">${shopIcon}</span>
                    <div>
                        <div style="font-size:16px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${shop.name}</div>
                        <div style="font-size:12px;color:#fff1e6;font-weight:500;">Fresh Food, Refreshing Drinks & Full Health Recovery</div>
                    </div>
                </div>
                <button id="gta-food-close" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;border-radius:4px;">✕</button>
            `;
            card.appendChild(head);

            const statusBar = document.createElement('div');
            statusBar.style.cssText = 'background:#1a2432;padding:10px 20px;font-size:13px;color:#a2b5cc;border-bottom:1px solid #283748;display:flex;align-items:center;justify-content:space-between;';
            const curMoney = (this._game && this._game.player) ? this._game.player.money : 0;
            const curHp = (this._game && this._game.player) ? Math.round(this._game.player.health) : 100;
            statusBar.innerHTML = `<span>Health: <b id="gta-food-hp" style="color:#ff3b30;">${curHp}%</b> · Cash: <b id="gta-food-cash" style="color:#39ff88;">${curMoney}</b></span><span style="color:#71849a;">Press [Esc] to exit</span>`;
            card.appendChild(statusBar);

            const list = document.createElement('div');
            list.style.cssText = 'padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;max-height:58vh;';

            let MENU = [];
            if (isPizza) {
                MENU = [
                    { id: 'slice', name: 'NY Cheese Pizza Slice', price: 8, heal: 35, icon: '🍕', desc: 'Hot, bubbly mozzarella and rich marinara sauce. (+35 HP)' },
                    { id: 'pep', name: 'Pepperoni Supremo Slice', price: 12, heal: 45, icon: '🍕', desc: 'Crispy cupped pepperoni loaded with flavor. (+45 HP)' },
                    { id: 'sub', name: "Luigi's Meatball Parm Sub", price: 16, heal: 65, icon: '🥖', desc: 'Toasted hero with savory Italian meatballs and melted provolone. (+65 HP)' },
                    { id: 'soda', name: 'San Pellegrino Italian Soda', price: 4, heal: 18, type: 'drink', icon: '🥤', desc: 'Sparkling citrus soda, crisp and invigorating. (+18 HP)' },
                    { id: 'pie', name: "Grandma's 18-Inch Whole Pie", price: 30, heal: 100, icon: '🍕', desc: 'Huge family pie made fresh to order. Heals 100% Full Health.' },
                ];
            } else if (isCafe) {
                MENU = [
                    { id: 'espresso', name: 'Artisan Double Espresso', price: 5, heal: 22, type: 'drink', icon: '☕', desc: 'Bold dark roast espresso shot. Swift stamina restoration. (+22 HP)' },
                    { id: 'bagel', name: 'Sesame Bagel with Cream Cheese', price: 8, heal: 35, icon: '🥯', desc: 'Authentic boiled NYC bagel, toasted with scallion spread. (+35 HP)' },
                    { id: 'croissant', name: 'Butter Chocolate Croissant', price: 7, heal: 30, icon: '🥐', desc: 'Flaky French pastry baked with Belgian chocolate. (+30 HP)' },
                    { id: 'coldbrew', name: 'DUMBO Nitro Cold Brew', price: 6, heal: 26, type: 'drink', icon: '🧋', desc: 'Smooth nitro draught iced coffee on tap. (+26 HP)' },
                    { id: 'brunch', name: 'Roastery Brunch Grand Platter', price: 24, heal: 100, icon: '🍳', desc: 'Eggs, avocado toast, pastries, and house coffee. Heals 100% Full Health.' },
                ];
            } else if (isCart) {
                MENU = [
                    { id: 'hotdog', name: "Nathan's Famous Street Hot Dog", price: 5, heal: 25, icon: '🌭', desc: 'Classic NYC Sabrett dirty-water dog with mustard & kraut. (+25 HP)' },
                    { id: 'pretzel', name: 'Hot Salted Giant Pretzel', price: 4, heal: 20, icon: '🥨', desc: 'Warm soft pretzel sprinkled with coarse sea salt. (+20 HP)' },
                    { id: 'gyro', name: 'Halal Lamb & Beef Gyro Wrap', price: 9, heal: 45, icon: '🌯', desc: 'Spiced shaved gyro with tzatziki in warm pita. (+45 HP)' },
                    { id: 'soda', name: 'Ice Cold Can of Soda', price: 3, heal: 15, type: 'drink', icon: '🥤', desc: 'Chilled soda can straight from the cart cooler. (+15 HP)' },
                    { id: 'nuts', name: 'Honey Roasted Hot Nuts', price: 5, heal: 25, icon: '🥜', desc: 'Sweet and crunchy hot roasted cashews & almonds. (+25 HP)' },
                ];
            } else {
                MENU = [
                    { id: 'burger', name: 'Deluxe Double Bacon Cheeseburger', price: 14, heal: 50, icon: '🍔', desc: 'Two smash patties, aged cheddar, smoked bacon & diner sauce. (+50 HP)' },
                    { id: 'fries', name: 'Golden Crispy Fries Basket', price: 6, heal: 22, icon: '🍟', desc: 'Double-fried hand-cut Idaho potatoes with diner seasoning. (+22 HP)' },
                    { id: 'pastrami', name: 'Hot Pastrami on Seeded Rye', price: 16, heal: 65, icon: '🥪', desc: 'Melt-in-your-mouth spiced smoked pastrami with spicy mustard. (+65 HP)' },
                    { id: 'shake', name: 'Thick Malted Chocolate Shake', price: 7, heal: 30, type: 'drink', icon: '🥤', desc: 'Hand-spun ice cream milkshake with malted chocolate. (+30 HP)' },
                    { id: 'feast', name: 'The Brow City Mega Diner Feast', price: 28, heal: 100, icon: '🥞', desc: 'Full stack buttermilk pancakes, bacon, eggs, burger & shake. (+100 HP)' },
                ];
            }

            const renderFood = () => {
                list.innerHTML = '';
                const p = this._game && this._game.player;
                const pCash = p ? p.money : 0;
                const pHealth = p ? Math.round(p.health) : 100;
                const hpEl = card.querySelector('#gta-food-hp');
                const cashEl = card.querySelector('#gta-food-cash');
                if (hpEl) hpEl.textContent = pHealth + '%';
                if (cashEl) cashEl.textContent = '$' + pCash;

                for (const item of MENU) {
                    const row = document.createElement('div');
                    row.style.cssText = 'background:#1a2330;border:1px solid #2c394c;border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
                    
                    const canAfford = pCash >= item.price;
                    const actionWord = item.type === 'drink' ? 'DRINK' : 'EAT';
                    row.innerHTML = `
                        <div style="display:flex;align-items:center;gap:12px;flex:1;">
                            <span style="font-size:28px;background:#111620;padding:6px;border-radius:8px;">${item.icon}</span>
                            <div>
                                <div style="font-weight:700;font-size:14px;color:#fff;">${item.name}</div>
                                <div style="font-size:12px;color:#89a2bc;margin-top:2px;">${item.desc}</div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:14px;">
                            <span style="font-weight:800;font-size:15px;color:#39ff88;">${item.price}</span>
                            <button class="gta-eat-btn" style="background:${canAfford ? '#1f7a42' : '#2d3848'};color:${canAfford ? '#fff' : '#6f839c'};border:none;padding:7px 16px;border-radius:6px;font-weight:700;font-size:12px;cursor:${canAfford ? 'pointer' : 'not-allowed'};transition:background 0.2s;">
                                ${canAfford ? actionWord : 'NO CASH'}
                            </button>
                        </div>
                    `;

                    const btn = row.querySelector('.gta-eat-btn');
                    if (canAfford) {
                        btn.onclick = () => {
                            if (onEat) onEat(item);
                            renderFood();
                        };
                        btn.onmouseover = () => btn.style.background = '#289e56';
                        btn.onmouseout = () => btn.style.background = '#1f7a42';
                    }
                    list.appendChild(row);
                }
            };
            renderFood();
            card.appendChild(list);

            modal.appendChild(card);
            this.win.appendChild(modal);
            this._foodModal = modal;

            const closeBtn = card.querySelector('#gta-food-close');
            if (closeBtn) closeBtn.onclick = () => this.closeFoodShopModal();

            modal.onclick = (e) => {
                if (e.target === modal) this.closeFoodShopModal();
            };

            this._foodKeyHandler = (e) => {
                if (e.code === 'Escape') this.closeFoodShopModal();
            };
            window.addEventListener('keydown', this._foodKeyHandler);
            this._foodOnClose = onClose;
        }

        closeFoodShopModal() {
            if (this._foodModal && this._foodModal.parentNode) {
                this._foodModal.parentNode.removeChild(this._foodModal);
            }
            this._foodModal = null;
            if (this._foodKeyHandler) {
                window.removeEventListener('keydown', this._foodKeyHandler);
                this._foodKeyHandler = null;
            }
            if (this._foodOnClose) {
                const cb = this._foodOnClose;
                this._foodOnClose = null;
                cb();
            }
        }

        showSubwayModal(stations, currentStation, onSelect, onClose) {            this.closeSubwayModal();
            const modal = document.createElement('div');
            modal.className = 'gta-subway-modal';
            modal.style.cssText = 'position:absolute;inset:0;background:rgba(10,16,26,0.85);backdrop-filter:blur(8px);z-index:250;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;';

            const card = document.createElement('div');
            card.style.cssText = 'background:#141e2b;border:1px solid #2e4359;border-radius:12px;width:min(520px,90vw);max-height:85vh;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;';

            const head = document.createElement('div');
            head.style.cssText = 'background:#0039a6;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #ffcc00;';
            head.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:26px;">🚇</span>
                    <div>
                        <div style="font-size:16px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">MTA New York City Subway</div>
                        <div style="font-size:12px;color:#cce0ff;font-weight:500;">Brow City Transit Network · Flat Fare $2.75</div>
                    </div>
                </div>
                <button id="gta-subway-close" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;">✕</button>
            `;
            card.appendChild(head);

            const curBar = document.createElement('div');
            curBar.style.cssText = 'background:#1a2737;padding:10px 20px;font-size:12px;color:#8ba5c4;border-bottom:1px solid #26384a;display:flex;align-items:center;gap:6px;';
            curBar.innerHTML = `<span style="color:#57ddba;font-weight:700;">● CURRENT STATION:</span> <strong style="color:#fff;">${currentStation.name}</strong> <span style="margin-left:auto;background:${currentStation.color || '#00933c'};color:#fff;font-weight:800;border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">${currentStation.lineCode || 'M'}</span>`;
            card.appendChild(curBar);

            const list = document.createElement('div');
            list.style.cssText = 'padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;';

            for (const st of stations) {
                if (st.id === currentStation.id) continue;
                const row = document.createElement('div');
                row.style.cssText = 'background:#1b2838;border:1px solid #273b50;border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;transition:background 0.15s;cursor:pointer;';
                row.onmouseenter = () => { row.style.background = '#22344a'; row.style.borderColor = '#3d5c7d'; };
                row.onmouseleave = () => { row.style.background = '#1b2838'; row.style.borderColor = '#273b50'; };

                const dMeters = Math.round(Math.hypot(st.x - currentStation.x, st.z - currentStation.z));
                row.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="background:${st.color || '#ee352e'};color:#fff;font-weight:800;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${st.lineCode || '1'}</span>
                        <div>
                            <div style="font-size:14px;font-weight:700;color:#fff;">${st.name}</div>
                            <div style="font-size:11px;color:#8ba5c4;">${st.line} · ~${dMeters}m away</div>
                        </div>
                    </div>
                    <button style="background:#00933c;border:none;color:#fff;font-weight:700;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;">Take Train ($2.75)</button>
                `;
                row.onclick = () => {
                    this.closeSubwayModal();
                    if (onSelect) onSelect(st);
                };
                list.appendChild(row);
            }
            card.appendChild(list);

            modal.appendChild(card);
            this.win.appendChild(modal);
            this._subwayModal = modal;

            modal.querySelector('#gta-subway-close').onclick = () => {
                this.closeSubwayModal();
                if (onClose) onClose();
            };
        }

        closeSubwayModal() {
            if (this._subwayModal && this._subwayModal.parentNode) {
                this._subwayModal.parentNode.removeChild(this._subwayModal);
            }
            this._subwayModal = null;
        }

        showSubwayRide(destStation, onDone) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;background:#060a10;z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;transition:opacity 0.4s;opacity:0;';
            overlay.innerHTML = `
                <div style="font-size:54px;margin-bottom:12px;">🚇</div>
                <div style="background:${destStation.color || '#00933c'};color:#fff;font-weight:800;border-radius:50%;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:14px;">${destStation.lineCode || '1'}</div>
                <div style="font-size:22px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;text-align:center;">Next Stop: ${destStation.name}</div>
                <div style="font-size:13px;color:#8ba5c4;font-style:italic;">Stand clear of the closing doors, please! 🔔</div>
            `;
            this.win.appendChild(overlay);
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });

            setTimeout(() => {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    if (onDone) onDone();
                }, 400);
            }, 1400);
        }

        showBusModal(stops, onSelect, onClose) {
            this.closeBusModal();
            const modal = document.createElement('div');
            modal.className = 'gta-bus-modal';
            modal.style.cssText = 'position:absolute;inset:0;background:rgba(10,16,26,0.85);backdrop-filter:blur(8px);z-index:260;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;';

            const card = document.createElement('div');
            card.style.cssText = 'background:#141e2b;border:1px solid #2e4359;border-radius:12px;width:min(520px,90vw);max-height:85vh;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.6);display:flex;flex-direction:column;';

            const head = document.createElement('div');
            head.style.cssText = 'background:#0e7a3d;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #ffd54f;';
            head.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:26px;">🚌</span>
                    <div>
                        <div style="font-size:16px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">Brow City Transit · Bus</div>
                        <div style="font-size:12px;color:#c8f0d8;font-weight:500;">Choose a destination anywhere on the map · Flat Fare $2.00</div>
                    </div>
                </div>
                <button id="gta-bus-close" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px 8px;">✕</button>
            `;
            card.appendChild(head);

            const hint = document.createElement('div');
            hint.style.cssText = 'background:#1a2737;padding:10px 20px;font-size:12px;color:#8ba5c4;border-bottom:1px solid #26384a;display:flex;align-items:center;gap:6px;';
            hint.innerHTML = `<span style="color:#ffd54f;font-weight:700;">TIP:</span> You can pick a stop from the list below, <strong style="color:#fff;">or open the full map</strong> (press <strong style="color:#fff;">M</strong>) and click any stop's marker to select it.`;
            card.appendChild(hint);

            const list = document.createElement('div');
            list.style.cssText = 'padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;';

            for (const st of stops) {
                const row = document.createElement('div');
                row.style.cssText = 'background:#1b2838;border:1px solid #273b50;border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;transition:background 0.15s;cursor:pointer;';
                row.onmouseenter = () => { row.style.background = '#22344a'; row.style.borderColor = '#3d5c7d'; };
                row.onmouseleave = () => { row.style.background = '#1b2838'; row.style.borderColor = '#273b50'; };
                row.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="background:${st.color || '#2b8a3a'};color:#fff;font-weight:800;border-radius:50%;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">B</span>
                        <div>
                            <div style="font-size:14px;font-weight:700;color:#fff;">${st.name}</div>
                            <div style="font-size:11px;color:#8ba5c4;">Bus stop · Fare $2.00</div>
                        </div>
                    </div>
                    <button style="background:#0e7a3d;border:none;color:#fff;font-weight:700;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;">Ride Bus ($2)</button>
                `;
                row.onclick = () => {
                    this.closeBusModal();
                    if (onSelect) onSelect(st);
                };
                list.appendChild(row);
            }
            card.appendChild(list);

            // "open the map to pick" launcher
            const mapBtn = document.createElement('div');
            mapBtn.style.cssText = 'background:#0e7a3d;margin:0 12px 14px;padding:12px;border-radius:8px;text-align:center;font-size:13px;font-weight:700;color:#fff;cursor:pointer;border:1px solid #1ba34f;';
            mapBtn.textContent = '🗺️  Open Full Map · tap a stop marker to travel there';
            mapBtn.onclick = () => {
                this.closeBusModal();
                if (onSelect) onSelect({ map: true });
            };
            card.appendChild(mapBtn);

            modal.appendChild(card);
            this.win.appendChild(modal);
            this._busModal = modal;

            modal.querySelector('#gta-bus-close').onclick = () => {
                this.closeBusModal();
                if (onClose) onClose();
            };
        }

        closeBusModal() {
            if (this._busModal && this._busModal.parentNode) {
                this._busModal.parentNode.removeChild(this._busModal);
            }
            this._busModal = null;
        }

        /* ---- jail (busted) overlay ------------------------------------------ */
        showJailOverlay(info) {
            this.closeJailOverlay();
            const ov = document.createElement('div');
            ov.className = 'gta-jail-overlay';
            ov.style.cssText = 'position:absolute;inset:0;background:rgba(5,8,14,0.82);backdrop-filter:blur(6px);z-index:270;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;';
            ov.innerHTML = `
                <div style="font-size:56px;margin-bottom:8px;">🔒</div>
                <div style="font-size:24px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#8fb7ff;">Locked Up · Busted</div>
                <div style="font-size:13px;color:#8ba5c4;margin:6px 0 18px;">Police HQ · West Wing Holding Cell</div>
                <div style="background:#141e2b;border:1px solid #2e4359;border-radius:12px;padding:16px 20px;width:min(420px,90vw);text-align:center;">
                    <div style="font-size:13px;color:#8ba5c4;margin-bottom:10px;">Choose one:</div>
                    <button id="gta-jail-bail" style="display:block;width:100%;background:#0e7a3d;border:none;color:#fff;font-weight:700;font-size:14px;padding:12px;border-radius:8px;cursor:pointer;margin-bottom:10px;">💵 Pay Bail · $${info.bail}</button>
                    ${info.canBail ? '' : '<div style="font-size:11px;color:#ff8a80;margin:-6px 0 10px;">Not enough cash — only way out is the hard way.</div>'}
                    <button id="gta-jail-escape" style="display:block;width:100%;background:#8a2f2f;border:none;color:#fff;font-weight:700;font-size:14px;padding:12px;border-radius:8px;cursor:pointer;">🔓 Escape Plan</button>
                    <div style="font-size:11px;color:#8ba5c4;margin-top:12px;line-height:1.5;">Escape: wait for the hallway officer, then grab the keys<br>(tap <b>E</b> beside the cell door) and kill your way out.</div>
                </div>
            `;
            this.win.appendChild(ov);
            this._jailOverlay = ov;
            ov.querySelector('#gta-jail-bail').onclick = () => { if (info.onBail) info.onBail(); };
            ov.querySelector('#gta-jail-escape').onclick = () => { if (info.onEscape) info.onEscape(); };
        }

        closeJailOverlay() {
            if (this._jailOverlay && this._jailOverlay.parentNode) {
                this._jailOverlay.parentNode.removeChild(this._jailOverlay);
            }
            this._jailOverlay = null;
        }

        showJailHud(msg, color) {
            this.closeJailHud();
            const h = document.createElement('div');
            h.style.cssText = `position:absolute;top:18%;left:50%;transform:translateX(-50%);z-index:275;background:rgba(6,10,16,0.85);border:1px solid ${color || '#8fb7ff'};color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:700;padding:12px 20px;border-radius:10px;pointer-events:none;text-align:center;`;
            h.textContent = msg;
            this.win.appendChild(h);
            this._jailHud = h;
        }

        closeJailHud() {
            if (this._jailHud && this._jailHud.parentNode) this._jailHud.parentNode.removeChild(this._jailHud);
            this._jailHud = null;
        }

        showBusRide(dest, onDone) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;background:#060a10;z-index:320;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;transition:opacity 0.4s;opacity:0;';
            overlay.innerHTML = `
                <div style="font-size:54px;margin-bottom:12px;">🚌</div>
                <div style="background:${dest.color || '#2b8a3a'};color:#fff;font-weight:800;border-radius:50%;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:14px;">B</div>
                <div style="font-size:22px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;text-align:center;">Next Stop: ${dest.name}</div>
                <div style="font-size:13px;color:#8ba5c4;font-style:italic;">Please move to the rear of the bus. 🚏</div>
            `;
            this.win.appendChild(overlay);
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });

            setTimeout(() => {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    if (onDone) onDone();
                }, 400);
            }, 1600);
        }

        /**
         * GTA-style rotating circular minimap: the atlas is drawn around the
         * player, rotated so the camera's facing points up.
         *
         * Perf notes (this was the lag source):
         *  · old code re-drew the WHOLE 500x1000 atlas every 150ms and let the
         *    GPU clip it — plus a 2.4x upscale that blurred everything.
         *  · new code crops a small source tile (~350px) around the player and
         *    redraws at 30fps from a hi-res atlas: cheaper AND sharper.
         */
        drawMinimap(game, dt) {
            this._game = game;
            // Big map ticks on its own throttle so closing it never stalls HUD.
            if (this._bigOpen) this._drawBigmap(game, dt);

            const p = game.player;
            if (!p || !game.builder || !game.builder.minimapAtlas) return;
            const builder = game.builder, meta = builder.minimapMeta;
            const atlas = builder.minimapAtlas;

            // Smooth-follow camera: critically-damped position + shortest-arc
            // yaw so sprinting/driving glides instead of snapping. dt is real
            // frame time, so this stays smooth at 30Hz or 144Hz.
            const px = p.pos.x, pz = p.pos.z;
            const yaw = p.camYaw || 0;
            const fdt = clamp(dt || 0.016, 0.0005, 0.06);
            if (this._smX === null || this._smX === undefined ||
                Math.hypot(px - this._smX, pz - this._smZ) > 400) {
                this._smX = px; this._smZ = pz; this._smYaw = yaw;
            } else {
                // Snappier than the old 0-lag snap, but damped: no jitter,
                // no rubber-banding. Slightly tighter while driving fast.
                const driving = !!(p.inVehicle && Math.abs(p.inVehicle.speed || 0) > 8);
                this._smX = damp(this._smX, px, driving ? 10 : 7, fdt);
                this._smZ = damp(this._smZ, pz, driving ? 10 : 7, fdt);
                this._smYaw += angleDelta(this._smYaw || 0, yaw) * (1 - Math.exp(-8 * fdt));
            }
            // Smooth zoom: ease the rendered zoom toward the wheel target,
            // with a speed-aware base (zoom out as you drive faster).
            let speedZoom = 1;
            if (p.inVehicle) {
                const sp = Math.abs(p.inVehicle.speed || 0);
                speedZoom = clamp(1 - sp / 160, 0.62, 1);
            } else if (p.vel) {
                const sp = Math.hypot(p.vel.x || 0, p.vel.z || 0);
                speedZoom = clamp(1 - sp / 120, 0.8, 1);
            }
            const zoomTarget = clamp(this._mmZoomT * speedZoom, 0.4, 3.2);
            this._mmZoom = (this._mmZoom === undefined) ? zoomTarget : damp(this._mmZoom, zoomTarget, 7, fdt);
            // Free-pan glide: ease the rendered pan toward the drag target,
            // keep the release velocity for inertia, then auto-recenter after
            // a few idle seconds so the player never gets lost.
            if (!this._mmDrag) {
                this._mmPanTX += this._mmPanVX * fdt * 3.2;
                this._mmPanTZ += this._mmPanVZ * fdt * 3.2;
                const fr = Math.exp(-4.5 * fdt);
                this._mmPanVX *= fr; this._mmPanVZ *= fr;
                if (Math.hypot(this._mmPanVX, this._mmPanVZ) < 0.5) { this._mmPanVX = 0; this._mmPanVZ = 0; }
            }
            if (this._mmFree && !this._mmDrag) {
                this._mmIdleT += fdt;
                if (this._mmIdleT > 4) this._recenterMinimap(true);
            }
            this._mmPanX = damp(this._mmPanX || 0, this._mmPanTX, 9, fdt);
            this._mmPanZ = damp(this._mmPanZ || 0, this._mmPanTZ, 9, fdt);
            if (Math.hypot(this._mmPanTX - this._mmPanX, this._mmPanTZ - this._mmPanZ) < 0.05 &&
                Math.hypot(this._mmPanTX, this._mmPanTZ) < 0.05) {
                this._mmPanX = 0; this._mmPanZ = 0; this._mmPanTX = 0; this._mmPanTZ = 0;
                this._mmFree = false;
            }
            const smX = this._smX, smZ = this._smZ, smYaw = this._smYaw;
            const ctx = this.mm;
            const W = this.minimap.width, H = this.minimap.height;
            const R = W / 2;
            const baseView = 160; // meters from center to edge at 1x
            const view = baseView / this._mmZoom;
            this._mmView = view;
            const k = R / view; // dest px per world meter
            // Pan is a world-space offset applied in the rotated frame: the
            // camera center moves while the player arrow stays glued. When
            // panned far, gently pull the target back so blips stay sane.
            const panDist = Math.hypot(this._mmPanX, this._mmPanZ);
            const maxPan = view * 0.95;
            if (panDist > maxPan) {
                const s = maxPan / panDist;
                this._mmPanX *= s; this._mmPanZ *= s; this._mmPanTX *= s; this._mmPanTZ *= s;
            }

            ctx.clearRect(0, 0, W, H);
            ctx.save();
            ctx.beginPath();
            ctx.arc(R, R, R - 2, 0, Math.PI * 2);
            ctx.clip();

            // Background fill for areas beyond the water/skirt
            ctx.fillStyle = '#122639';
            ctx.fillRect(0, 0, W, H);

            // Atlas crop: rotated around the smoothed camera center
            const ss = view * 2 * 1.5 * meta.s;
            const sx = (smX - WORLD.MIN_X) * meta.s + meta.ox - ss / 2;
            const sy = (smZ - WORLD.MIN_Z) * meta.s + meta.oz - ss / 2;
            const dd = ss * (k / meta.s);

            ctx.save();
            ctx.translate(R, R);
            ctx.rotate(smYaw);
            // Counter-translate the pan offset into map space so dragging the
            // map moves the world under a fixed player arrow.
            const pcy = Math.cos(smYaw), psy = Math.sin(smYaw);
            ctx.translate(-(this._mmPanX * pcy - this._mmPanZ * psy) * k,
                -(this._mmPanX * psy + this._mmPanZ * pcy) * k);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            try {
                ctx.drawImage(atlas, sx, sy, ss, ss, -dd / 2, -dd / 2, dd, dd);
            } catch (e) { /* atlas not ready */ }
            ctx.restore();

            // Screen-space rotated blips around the smoothed, panned center.
            const cy = Math.cos(smYaw), syaw = Math.sin(smYaw);
            const toScreen = (wx, wz) => {
                const dx = (wx - smX) - this._mmPanX, dz = (wz - smZ) - this._mmPanZ;
                return [
                    (dx * cy - dz * syaw) * k,
                    (dx * syaw + dz * cy) * k
                ];
            };

            const blip = (wx, wz, color, r, stroke, clampRim) => {
                const [rx, rz] = toScreen(wx, wz);
                const d = Math.hypot(rx, rz);
                const lim = R - 14;
                if (d > lim) {
                    if (!clampRim) return; // Don't clutter rim with distant cars
                    const scale = lim / d;
                    ctx.beginPath();
                    ctx.arc(R + rx * scale, R + rz * scale, r, 0, Math.PI * 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(R + rx, R + rz, r, 0, Math.PI * 2);
                }
                ctx.fillStyle = color;
                ctx.fill();
                if (stroke) {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                    ctx.stroke();
                }
            };

            // GPS route: dark casing + purple core
            const route = game.route;
            if (route && route.pts && route.pts.length > 1) {
                const trace = () => {
                    ctx.beginPath();
                    // Catmull-Rom -> bezier through the smoothed route points
                    // so the ribbon bends smoothly without loops or sharp kinks.
                    const sp = [];
                    for (let i = 0; i < route.pts.length; i++) {
                        const pt = route.pts[i];
                        const [rx, rz] = toScreen(pt.x, pt.z);
                        const sx = R + rx, sz = R + rz;
                        if (sp.length > 0) {
                            const last = sp[sp.length - 1];
                            const d = Math.hypot(sx - last[0], sz - last[1]);
                            if (d < 2.5 && i + 1 < route.pts.length) continue;
                        }
                        sp.push([sx, sz]);
                    }
                    if (sp.length < 2) return;
                    ctx.moveTo(sp[0][0], sp[0][1]);
                    if (sp.length === 2) {
                        ctx.lineTo(sp[1][0], sp[1][1]);
                    } else {
                        for (let i = 0; i + 1 < sp.length; i++) {
                            const p0 = sp[Math.max(0, i - 1)], p1 = sp[i];
                            const p2 = sp[i + 1], p3 = sp[Math.min(sp.length - 1, i + 2)];
                            const d12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
                            if (d12 < 1e-3) continue;
                            let cp1x = p1[0] + (p2[0] - p0[0]) / 6;
                            let cp1y = p1[1] + (p2[1] - p0[1]) / 6;
                            let cp2x = p2[0] - (p3[0] - p1[0]) / 6;
                            let cp2y = p2[1] - (p3[1] - p1[1]) / 6;
                            const maxDist = d12 * 0.45;
                            const l1 = Math.hypot(cp1x - p1[0], cp1y - p1[1]);
                            if (l1 > maxDist) {
                                cp1x = p1[0] + (cp1x - p1[0]) * (maxDist / l1);
                                cp1y = p1[1] + (cp1y - p1[1]) * (maxDist / l1);
                            }
                            const l2 = Math.hypot(cp2x - p2[0], cp2y - p2[1]);
                            if (l2 > maxDist) {
                                cp2x = p2[0] + (cp2x - p2[0]) * (maxDist / l2);
                                cp2y = p2[1] + (cp2y - p2[1]) * (maxDist / l2);
                            }
                            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
                        }
                    }
                };
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                trace();
                ctx.lineWidth = 10;
                ctx.strokeStyle = 'rgba(10,8,20,0.85)';
                ctx.stroke();
                trace();
                ctx.lineWidth = 5.5;
                ctx.strokeStyle = WP_COLOR;
                ctx.stroke();
            }

            // Waypoint pin: clamped to the rim with a direction wedge when off-screen
            if (game.waypoint) {
                const [rx, rz] = toScreen(game.waypoint.x, game.waypoint.z);
                const d = Math.hypot(rx, rz);
                const lim = R - 18;
                const off = d > lim;
                let bx = rx, bz = rz;
                if (off) {
                    const scale = lim / d;
                    bx = rx * scale;
                    bz = rz * scale;
                    const a = Math.atan2(bz, bx);
                    ctx.save();
                    ctx.translate(R + bx, R + bz);
                    ctx.rotate(a);
                    ctx.beginPath();
                    ctx.moveTo(16, 0);
                    ctx.lineTo(5, -7);
                    ctx.lineTo(5, 7);
                    ctx.closePath();
                    ctx.fillStyle = WP_COLOR;
                    ctx.fill();
                    ctx.restore();
                }
                ctx.beginPath();
                ctx.arc(R + bx, R + bz, 8, 0, Math.PI * 2);
                ctx.fillStyle = WP_COLOR;
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(R + bx, R + bz, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
            }

            // Loot (only nearby)
            if (game.loot && game.loot.items) {
                for (const it of game.loot.items) blip(it.x, it.z, '#39ff88', 4.5, true, false);
            }

            // Nearby traffic vehicles (do NOT clamp distant cars to rim)
            if (game.field && game.field.vehicles) {
                for (const v of game.field.vehicles) {
                    if (v.driver === 'ai' && !v.parked) blip(v.x, v.z, 'rgba(215,220,228,0.85)', 3, false, false);
                }
            }

            // Police cruisers: pursuing police clamp to rim so player can see incoming sirens
            if (game.police && game.police.cruisers) {
                const blink = (game.time || 0) % 0.8 < 0.4 ? '#ff4b3e' : '#4b8bff';
                for (const c of game.police.cruisers) blip(c.x, c.z, blink, 5.5, true, true);
            }

            // Hospital (healing cross blip)
            if (game.map && game.map.hospital) {
                blip(game.map.hospital.cx, game.map.hospital.cz, '#ff4757', 6.0, true, true);
            }
            // Police Headquarters (blue precinct blip)
            if (game.map && game.map.policeHQ) {
                blip(game.map.policeHQ.cx, game.map.policeHQ.cz, '#2e86de', 6.0, true, true);
            }
            // Gun shops (bright red weapon blip)
            if (game.gunShops) {
                for (const gs of game.gunShops) blip(gs.cx, gs.cz, '#ff3b30', 5.5, true, true);
            }
            // Food shops and dining establishments (warm orange blip)
            if (game.foodShops) {
                for (const fs of game.foodShops) blip(fs.cx, fs.cz, '#ff9500', 5.0, true, false);
            }
            // Street food carts (small gold blips)
            if (game.foodStalls) {
                for (const fs of game.foodStalls) blip(fs.x, fs.z, '#ffc043', 3.2, false, false);
            }
            // Subway stations
            if (game.subwayStations) {
                for (const st of game.subwayStations) blip(st.x, st.z, st.color || '#00933c', 4.5, false, false);
            }
            // Bus stops (Brow City Transit)
            if (game.bus && game.bus.stops) {
                for (const st of game.bus.stops) blip(st.x, st.z, st.color || '#2b8a3a', 4.2, false, true);
            }

            // Player arrow: with free-pan the world moves under it, so offset
            // it from center by the pan (rotated into screen space) and fade
            // it near the rim instead of letting it slide off.
            const parx = -(this._mmPanX * cy - this._mmPanZ * syaw) * k;
            const parz = -(this._mmPanX * syaw + this._mmPanZ * cy) * k;
            const parD = Math.hypot(parx, parz);
            ctx.save();
            ctx.translate(R + parx, R + parz);
            if (p.inVehicle && p.inVehicle.heading !== undefined) {
                const relH = p.inVehicle.heading - smYaw;
                ctx.rotate(relH);
            }
            ctx.globalAlpha = parD > R - 26 ? Math.max(0.25, 1 - (parD - (R - 26)) / 22) : 1;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0e1a2b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(8, 9);
            ctx.lineTo(0, 4.5);
            ctx.lineTo(-8, 9);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            // Panned-state hint chip: tap / double-click to snap back.
            if (this._mmFree && (Math.hypot(this._mmPanX, this._mmPanZ) > 4)) {
                ctx.font = '700 15px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                const msg = '◎ TAP TO RECENTER';
                const mtw = ctx.measureText(msg).width + 26;
                const mx0 = R - mtw / 2, my0 = 12;
                ctx.fillStyle = 'rgba(10,14,24,0.72)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(mx0, my0, mtw, 24, 12);
                else ctx.rect(mx0, my0, mtw, 24);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.fillText(msg, R, my0 + 17);
            }

            // North pointer: N sits where world-north currently points
            const nx = R + Math.sin(-smYaw) * (R - 20);
            const nz = R - Math.cos(-smYaw) * (R - 20);
            ctx.save();
            ctx.translate(nx, nz);
            ctx.rotate(-smYaw);
            ctx.fillStyle = '#ff5f57';
            ctx.beginPath();
            ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('N', 0, 16);
            ctx.restore();

            // End circular clip
            ctx.restore();

            // Outer bezel ring
            ctx.beginPath();
            ctx.arc(R, R, R - 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(R, R, R - 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(8,14,24,0.85)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Waypoint distance pill (backing store is 2x, so 2x font sizes)
            // Turn hint: derive from the smoothed route so the next maneuver
            // is stable instead of flickering between adjacent nodes.
            if (game.waypoint && game.player) {
                const hint = game.getNavHint ? game.getNavHint() : null;
                const dx = game.waypoint.x - px;
                const dz = game.waypoint.z - pz;
                const m = hint && hint.dist !== undefined
                    ? hint.dist
                    : Math.sqrt(dx * dx + dz * dz);
                let label = m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
                if (hint && hint.text) label = hint.text + ' · ' + label;
                ctx.font = '700 21px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                const tw = ctx.measureText(label).width + 34;
                const bx0 = R - tw / 2, by0 = H - 44;
                ctx.fillStyle = 'rgba(10,8,20,0.78)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx0, by0, tw, 30, 15);
                else ctx.rect(bx0, by0, tw, 30);
                ctx.fill();
                ctx.fillStyle = WP_COLOR;
                ctx.beginPath();
                ctx.arc(bx0 + 17, by0 + 15, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(label, R + 8, by0 + 22);
            }
        }

        /* ---- fullscreen map -------------------------------------------------- */
        _buildBigmap() {
            const doc = this.win.ownerDocument || document;
            const root = doc.createElement('div');
            root.id = 'gta-bigmap';
            root.style.display = 'none';
            root.innerHTML =
                '<div class="gta-bigmap-backdrop"></div>' +
                '<div class="gta-bigmap-panel">' +
                '<div class="gta-bigmap-header"><span>BROW CITY MAP</span>' +
                '<span class="gta-bigmap-zone" id="gta-bigmap-zone"></span>' +
                '<span style="flex:1"></span>' +
                '<button class="gta-bigmap-btn" data-act="zoom-out" title="Zoom out">−</button>' +
                '<button class="gta-bigmap-btn" data-act="zoom-in" title="Zoom in">+</button>' +
                '<button class="gta-bigmap-btn" data-act="recenter" title="Center on player">◎</button>' +
                '<button class="gta-bigmap-btn" data-act="pin" title="Clear waypoint pin">📍</button>' +
                '<button class="gta-bigmap-btn close" data-act="close" title="Close (M)">✕</button></div>' +
                '<div class="gta-bigmap-body"><canvas id="gta-bigmap-canvas"></canvas>' +
                '<div class="gta-bigmap-legend">' +
                '<span><i style="background:#ffd24b"></i>Landmark</span>' +
                '<span><i style="background:#ff5fc8"></i>Times Sq</span>' +
                '<span><i style="background:#ff6b6b"></i>Hospital</span>' +
                '<span><i style="background:#4b8bff"></i>Police</span>' +
                '<span><i style="background:#ff9a3d"></i>Spray</span>' +
                '<span><i style="background:#39ff88"></i>Loot</span>' +
                '</div></div>' +
                '<div class="gta-bigmap-footer">Click map to set waypoint · X pins center · right-click clears · drag to pan · wheel to zoom · M / ✕ to close</div>' +
                '</div>';
            this.win.appendChild(root);
            this._bigRoot = root;
            this._bigCanvas = root.querySelector('#gta-bigmap-canvas');
            this._bigCtx = this._bigCanvas.getContext('2d');
            this._bigZone = root.querySelector('#gta-bigmap-zone');
            this._bigOpen = false;
            this._bigZoom = 1; this._bigZoomT = 1;
            this._bigZoomCX = null; this._bigZoomCZ = null; // cursor-anchored zoom focal (canvas px)
            this._bigCX = null; this._bigCZ = null; // world center; null = follow player
            this._bigRCX = null; this._bigRCZ = null; // rendered (damped) center
            this._bigPVX = 0; this._bigPVZ = 0; // pan inertia (world m/s)
            this._bigT = 0;
            const self = this;
            root.querySelector('.gta-bigmap-backdrop').addEventListener('click', () => self.closeBigmap());
            root.querySelectorAll('.gta-bigmap-btn').forEach((b) => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const act = b.getAttribute('data-act');
                    if (act === 'close') self.closeBigmap();
                    else if (act === 'zoom-in') self._bigZoomTo(self._bigZoomT * 1.25);
                    else if (act === 'zoom-out') self._bigZoomTo(self._bigZoomT / 1.25);
                    else if (act === 'recenter') { self._bigCX = null; self._bigCZ = null; self._bigPVX = 0; self._bigPVZ = 0; }
                    else if (act === 'pin') {
                        if (self._game && self._game.waypoint) self._game.clearWaypoint(false);
                        else if (self._game) self._game.hud.toast('Click anywhere on the map to drop a pin', '#c86bff');
                    }
                });
            });
            // Pan with drag; plain click drops a waypoint pin. The pin uses a
            // direct `click` listener (not window mouseup target-matching) so
            // OS-level handlers can't swallow it.
            let dragging = false, lx = 0, ly = 0, downX = 0, downY = 0, dragDist = 0;
            let dragVX = 0, dragVZ = 0, lastMoveT = 0; // release-velocity tracker
            const toWorld = (dxPx, dyPx) => {
                const r = self._bigView;
                if (!r) return [0, 0];
                return [dxPx / r.k, dyPx / r.k];
            };
            const canvasPointToWorld = (clientX, clientY) => {
                const r = self._bigView;
                if (!r || !self._game || !self._game.player) return null;
                const rect = self._bigCanvas.getBoundingClientRect();
                if (rect.width < 2 || rect.height < 2) return null;
                const dprX = self._bigCanvas.width / rect.width;
                const dprY = self._bigCanvas.height / rect.height;
                const px = (clientX - rect.left) * dprX;
                const py = (clientY - rect.top) * dprY;
                const cx = (r.cx !== undefined && r.cx !== null) ? r.cx : self._game.player.pos.x;
                const cz = (r.cz !== undefined && r.cz !== null) ? r.cz : self._game.player.pos.z;
                return { x: cx + (px - self._bigCanvas.width / 2) / r.k, z: cz + (py - self._bigCanvas.height / 2) / r.k };
            };
            const dropPinAt = (clientX, clientY) => {
                if (!self._bigOpen || !self._game) return;
                try {
                    const wpt = canvasPointToWorld(clientX, clientY);
                    // Bus destination picker: clicking a stop marker travels there.
                    if (self._busPickMode && self._game && self._game.bus) {
                        if (wpt && isFinite(wpt.x) && isFinite(wpt.z)) {
                            const ns = self._game.bus._nearestStop(wpt.x, wpt.z);
                            if (ns) {
                                self._game.hud.toast('Bus destination: ' + ns.name, '#57ddba');
                                self._busPickMode = false;
                                self.closeBigmap();
                                self._game.bus._startBusRide(ns);
                                return;
                            }
                        }
                        self._game.hud.toast('No bus stop there — tap a green B marker', '#ff8a80');
                        return;
                    }
                    if (wpt && isFinite(wpt.x) && isFinite(wpt.z)) self._game.setWaypoint(wpt.x, wpt.z);
                    else self._game.hud.toast('Could not read that map point — try again', '#ff8a80');
                } catch (err) {
                    self._game.hud.toast('Waypoint failed: ' + (err && err.message ? err.message : err), '#ff8a80');
                }
            };
            this._bigCanvas.addEventListener('mousedown', (e) => {
                dragging = true; lx = e.clientX; ly = e.clientY;
                downX = e.clientX; downY = e.clientY; dragDist = 0;
                dragVX = 0; dragVZ = 0; lastMoveT = performance.now();
                self._bigPVX = 0; self._bigPVZ = 0; // grab cancels glide
            });
            // Direct click: fires for a simple press+release on the canvas.
            this._bigCanvas.addEventListener('click', (e) => {
                if (dragDist < 6) dropPinAt(e.clientX, e.clientY);
            });
            doc.defaultView.addEventListener('mouseup', () => {
                if (dragging && dragDist > 6) {
                    // Release with a flick: keep the tracked velocity as glide.
                    self._bigPVX = clamp(dragVX, -2600, 2600);
                    self._bigPVZ = clamp(dragVZ, -2600, 2600);
                }
                dragging = false;
            });
            // Right-click clears the pin (game canvas keeps its own aim binding).
            this._bigCanvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (self._game && self._game.waypoint) self._game.clearWaypoint(false);
            });
            doc.defaultView.addEventListener('mousemove', (e) => {
                if (!dragging || !self._bigOpen || !self._game) return;
                const dx = e.clientX - lx, dy = e.clientY - ly;
                lx = e.clientX; ly = e.clientY;
                dragDist = Math.max(dragDist, Math.hypot(e.clientX - downX, e.clientY - downY));
                if (self._bigCX === null && self._game.player) {
                    self._bigCX = self._game.player.pos.x;
                    self._bigCZ = self._game.player.pos.z;
                    self._bigRCX = self._bigCX; self._bigRCZ = self._bigCZ;
                }
                const [wx, wz] = toWorld(-dx, -dy);
                self._bigCX += wx; self._bigCZ += wz;
                // Track release velocity (world m/s) with a light low-pass.
                const now = performance.now();
                const mdt = Math.max((now - lastMoveT) / 1000, 0.004);
                lastMoveT = now;
                dragVX = dragVX * 0.65 + (-wx / mdt) * 0.35;
                dragVZ = dragVZ * 0.65 + (-wz / mdt) * 0.35;
                // Dragging follows 1:1 — keep the rendered center glued.
                self._bigRCX = self._bigCX; self._bigRCZ = self._bigCZ;
            });
            this._bigCanvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                // Cursor-anchored smooth zoom: the world point under the cursor
                // stays under the cursor.
                const rect = self._bigCanvas.getBoundingClientRect();
                const fx = e.clientX - (rect.left + rect.width / 2);
                const fy = e.clientY - (rect.top + rect.height / 2);
                self._bigZoomCX = fx; self._bigZoomCZ = fy;
                const f = e.deltaY < 0 ? 1.12 : 0.89;
                if (e.deltaMode === 1) self._bigZoomTo(self._bigZoomT * (e.deltaY < 0 ? 1.3 : 0.77));
                else self._bigZoomTo(self._bigZoomT * Math.pow(f, clamp(Math.abs(e.deltaY) / 50, 0.5, 2)));
            }, { passive: false });
            this._bigKey = (e) => {
                if (!self._bigOpen) return;
                if (e.code === 'Escape' || e.code === 'KeyM') { e.stopPropagation(); self.closeBigmap(); }
            };
            doc.defaultView.addEventListener('keydown', this._bigKey, true);
        }

        toggleBigmap(game) {
            this._game = game;
            if (this._bigOpen) this.closeBigmap();
            else this.openBigmap(game);
        }

        _bigZoomTo(z) {
            this._bigZoomT = clamp(z, 0.6, 4);
        }

        openBigmap(game) {
            if (!game || !game.builder || !game.builder.minimapAtlas) return;
            this._game = game;
            // A captured cursor can't click the map — release it.
            try {
                const d = this.win.ownerDocument || document;
                if (d.exitPointerLock && d.pointerLockElement) d.exitPointerLock();
            } catch (e) { /* ignore */ }
            this._bigOpen = true;
            this._bigCX = null; this._bigCZ = null; // follow player
            this._bigRCX = null; this._bigRCZ = null;
            this._bigPVX = 0; this._bigPVZ = 0;
            this._bigZoomT = this._bigZoom || 1;
            this._bigT = 0; // draw immediately, then ease
            this._bigRoot.style.display = 'flex';
            this._sizeBigmap();
            this._drawBigmap(game, 1);
            if (!this._wpHintShown) {
                this._wpHintShown = true;
                game.hud.toast('Click the map to drop a waypoint pin (X pins center)', WP_COLOR);
            }
        }

        closeBigmap() {
            this._bigOpen = false;
            if (this._bigRoot) this._bigRoot.style.display = 'none';
        }

        _sizeBigmap() {
            const body = this._bigRoot.querySelector('.gta-bigmap-body');
            const r = body.getBoundingClientRect();
            const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
            const w = Math.max(320, Math.floor(r.width));
            const h = Math.max(320, Math.floor(r.height - 30)); // room for legend
            this._bigCanvas.style.width = w + 'px';
            this._bigCanvas.style.height = h + 'px';
            this._bigCanvas.width = Math.floor(w * dpr);
            this._bigCanvas.height = Math.floor(h * dpr);
        }

        _recenterMinimap(instant) {
            // Snap or glide the minimap back to follow mode.
            if (instant) {
                this._mmPanTX = 0; this._mmPanTZ = 0;
                this._mmPanVX = 0; this._mmPanVZ = 0;
            } else {
                this._mmPanTX = 0; this._mmPanTZ = 0;
                this._mmIdleT = 0;
            }
            if (this._game && this._game.player) {
                this._smX = this._game.player.pos.x;
                this._smZ = this._game.player.pos.z;
            }
            this._mmFree = false;
        }

        _drawBigmap(game, dt) {
            // Rendered state eases toward targets every frame (60fps smooth),
            // while the expensive atlas redraw stays throttled at 20fps.
            const fdt = clamp(dt || 0.05, 0.0005, 0.1);
            if (this._bigCX === null && game.player) {
                this._bigCX = game.player.pos.x;
                this._bigCZ = game.player.pos.z;
            }
            if (this._bigRCX === null || this._bigRCZ === null) {
                this._bigRCX = this._bigCX; this._bigRCZ = this._bigCZ;
            }
            // Cursor-anchored zoom easing: shift the target center so the focal
            // world point stays pinned while the zoom glides.
            const prevZoom = this._bigZoom || 1;
            const nextZoom = damp(prevZoom, this._bigZoomT || 1, 8, fdt);
            if (this._bigZoomCX !== null && Math.abs(nextZoom - prevZoom) > 1e-4 && this._bigView) {
                const kPrev = this._bigView.k * (prevZoom / (this._bigZoom || prevZoom || 1));
                const kNext = this._bigView.k * (nextZoom / (this._bigZoom || prevZoom || 1));
                if (kPrev > 1e-6 && kNext > 1e-6 && this._bigCX !== null) {
                    const rect = this._bigCanvas.getBoundingClientRect();
                    const dprX = (rect.width > 1) ? this._bigCanvas.width / rect.width : 1;
                    const fxDev = this._bigZoomCX * dprX;
                    const fyDev = this._bigZoomCZ * dprX;
                    const wx = this._bigCX + fxDev / kPrev, wz = this._bigCZ + fyDev / kPrev;
                    this._bigCX = wx - fxDev / kNext; this._bigCZ = wz - fyDev / kNext;
                    this._bigRCX = this._bigRCX === null ? this._bigCX : this._bigRCX;
                }
                if (Math.abs(nextZoom - (this._bigZoomT || 1)) < 0.002) {
                    this._bigZoomCX = null; this._bigZoomCZ = null;
                }
            }
            this._bigZoom = nextZoom;
            // Glide inertia after a flick-release, with friction.
            if (this._bigCX !== null && (this._bigPVX || this._bigPVZ)) {
                this._bigCX += this._bigPVX * fdt;
                this._bigCZ += this._bigPVZ * fdt;
                const fr = Math.exp(-3.2 * fdt);
                this._bigPVX *= fr; this._bigPVZ *= fr;
                if (Math.hypot(this._bigPVX, this._bigPVZ) < 4) { this._bigPVX = 0; this._bigPVZ = 0; }
            }
            // Rendered center chases the target (drag stays 1:1 because the
            // mousemove handler pins _bigRCX; this only smooths glide/zoom).
            if (this._bigRCX !== null && this._bigCX !== null) {
                this._bigRCX = damp(this._bigRCX, this._bigCX, 10, fdt);
                this._bigRCZ = damp(this._bigRCZ, this._bigCZ, 10, fdt);
            }
            this._bigT -= dt;
            if (this._bigT > 0) return;
            this._bigT = 1 / 20; // 20fps is plenty for a reference map
            const builder = game.builder, meta = builder && builder.minimapMeta;
            const atlas = builder && builder.minimapAtlas;
            if (!meta || !atlas || !game.player) return;
            // Follow player unless the user panned away.
            const rcx = (this._bigRCX !== null) ? this._bigRCX : this._bigCX;
            const rcz = (this._bigRCZ !== null) ? this._bigRCZ : this._bigCZ;
            const ctx = this._bigCtx;
            const W = this._bigCanvas.width, H = this._bigCanvas.height;
            const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
            // Fit whole island, then apply user zoom.
            const fit = Math.min(W / meta.w, H / meta.h);
            const k = fit * this._bigZoom; // device px per atlas px
            const mPerAtlasPx = 1 / meta.s;
            const kWorld = k / mPerAtlasPx; // device px per meter
            this._bigView = { k: kWorld, cx: rcx, cz: rcz };
            const cxA = (rcx - WORLD.MIN_X) * meta.s + meta.ox;
            const czA = (rcz - WORLD.MIN_Z) * meta.s + meta.oz;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#0b1524';
            ctx.fillRect(0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(atlas, W / 2 - cxA * k, H / 2 - czA * k, meta.w * k, meta.h * k);
            const toScreen = (wx, wz) => [
                W / 2 + (wx - rcx) * kWorld,
                H / 2 + (wz - rcz) * kWorld,
            ];
            // GPS route under everything but the atlas.
            if (game.route && game.route.pts && game.route.pts.length > 1) {
                ctx.lineJoin = 'round'; ctx.lineCap = 'round';
                const trace = () => {
                    ctx.beginPath();
                    const sp = [];
                    for (let i = 0; i < game.route.pts.length; i++) {
                        const [sx2, sz2] = toScreen(game.route.pts[i].x, game.route.pts[i].z);
                        if (sp.length > 0) {
                            const last = sp[sp.length - 1];
                            const d = Math.hypot(sx2 - last[0], sz2 - last[1]);
                            if (d < 2.5 * dpr && i + 1 < game.route.pts.length) continue;
                        }
                        sp.push([sx2, sz2]);
                    }
                    if (sp.length < 2) return;
                    ctx.moveTo(sp[0][0], sp[0][1]);
                    if (sp.length === 2) ctx.lineTo(sp[1][0], sp[1][1]);
                    else {
                        for (let i = 0; i + 1 < sp.length; i++) {
                            const p0 = sp[Math.max(0, i - 1)], p1 = sp[i];
                            const p2 = sp[i + 1], p3 = sp[Math.min(sp.length - 1, i + 2)];
                            const d12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
                            if (d12 < 1e-3) continue;
                            let cp1x = p1[0] + (p2[0] - p0[0]) / 6;
                            let cp1y = p1[1] + (p2[1] - p0[1]) / 6;
                            let cp2x = p2[0] - (p3[0] - p1[0]) / 6;
                            let cp2y = p2[1] - (p3[1] - p1[1]) / 6;
                            const maxDist = d12 * 0.45;
                            const l1 = Math.hypot(cp1x - p1[0], cp1y - p1[1]);
                            if (l1 > maxDist) {
                                cp1x = p1[0] + (cp1x - p1[0]) * (maxDist / l1);
                                cp1y = p1[1] + (cp1y - p1[1]) * (maxDist / l1);
                            }
                            const l2 = Math.hypot(cp2x - p2[0], cp2y - p2[1]);
                            if (l2 > maxDist) {
                                cp2x = p2[0] + (cp2x - p2[0]) * (maxDist / l2);
                                cp2y = p2[1] + (cp2y - p2[1]) * (maxDist / l2);
                            }
                            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
                        }
                    }
                };
                trace(); ctx.lineWidth = 6 * dpr; ctx.strokeStyle = 'rgba(10,8,20,0.85)'; ctx.stroke();
                trace(); ctx.lineWidth = 3 * dpr; ctx.strokeStyle = WP_COLOR; ctx.stroke();
            }
            // Loot / traffic / police under labels.
            if (game.loot && game.loot.items) {
                ctx.fillStyle = '#39ff88';
                for (const it of game.loot.items) {
                    const [bx, bz] = toScreen(it.x, it.z);
                    if (bx < -10 || bz < -10 || bx > W + 10 || bz > H + 10) continue;
                    ctx.beginPath(); ctx.arc(bx, bz, 3.2 * dpr, 0, TAU); ctx.fill();
                }
            }
            if (game.field && game.field.vehicles) {
                ctx.fillStyle = 'rgba(215,220,228,0.8)';
                for (const v of game.field.vehicles) {
                    if (v.driver !== 'ai' || v.parked) continue;
                    const [bx, bz] = toScreen(v.x, v.z);
                    if (bx < -10 || bz < -10 || bx > W + 10 || bz > H + 10) continue;
                    ctx.beginPath(); ctx.arc(bx, bz, 2.4 * dpr, 0, TAU); ctx.fill();
                }
            }
            if (game.police && game.police.cruisers) {
                const blink = (game.time || 0) % 0.8 < 0.4;
                ctx.fillStyle = blink ? '#ff4b3e' : '#4b8bff';
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * dpr;
                for (const c of game.police.cruisers) {
                    const [bx, bz] = toScreen(c.x, c.z);
                    if (bx < -12 || bz < -12 || bx > W + 12 || bz > H + 12) continue;
                    ctx.beginPath(); ctx.arc(bx, bz, 4.6 * dpr, 0, TAU); ctx.fill(); ctx.stroke();
                }
            }
            // Landmark pins + labels: majors always, minors once zoomed in.
            const MAJOR = { empire: 1, timessq: 1, wtc: 1, chrysler: 1, flatiron: 1, grandcentral: 1, police: 1, hospital: 1, spray: 1, gunshop: 1, foodshop: 1 };
            const lms = builder.minimapLandmarks || [];
            ctx.textAlign = 'center';
            for (const lm of lms) {
                const [bx, bz] = toScreen(lm.cx, lm.cz);
                if (bx < -40 || bz < -40 || bx > W + 40 || bz > H + 40) continue;
                const pr = (MAJOR[lm.kind] ? 5.5 : 4) * dpr;
                ctx.beginPath(); ctx.arc(bx, bz, pr, 0, TAU);
                ctx.fillStyle = lm.color; ctx.fill();
                ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
                if (MAJOR[lm.kind] || this._bigZoom > 1.35) {
                    ctx.font = '600 ' + Math.round(11 * dpr) + 'px -apple-system, "Segoe UI", sans-serif';
                    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(5,10,18,0.85)';
                    ctx.strokeText(lm.name, bx, bz - (7 * dpr));
                    ctx.fillStyle = '#fff';
                    ctx.fillText(lm.name, bx, bz - (7 * dpr));
                }
            }
            // Bus stops (drawn whenever known; highlighted while picking a ride).
            if (game.bus && game.bus.stops) {
                const picking = !!this._busPickMode;
                for (const st of game.bus.stops) {
                    const [bx2, bz2] = toScreen(st.x, st.z);
                    if (bx2 < -40 || bz2 < -40 || bx2 > W + 40 || bz2 > H + 40) continue;
                    const pr = (picking ? 6.5 : 4.2) * dpr;
                    ctx.beginPath(); ctx.arc(bx2, bz2, pr, 0, TAU);
                    ctx.fillStyle = picking ? '#2bff88' : (st.color || '#2b8a3a'); ctx.fill();
                    ctx.lineWidth = (picking ? 2.6 : 1.6) * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
                    if (picking || this._bigZoom > 1.7) {
                        ctx.font = '700 ' + Math.round(10 * dpr) + 'px -apple-system, "Segoe UI", sans-serif';
                        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(5,10,18,0.85)';
                        ctx.strokeText(st.name, bx2, bz2 - (7 * dpr));
                        ctx.fillStyle = picking ? '#2bff88' : '#c8f0d8';
                        ctx.fillText(st.name, bx2, bz2 - (7 * dpr));
                    }
                }
            }
            // Waypoint pin + remaining-distance label.
            if (game.waypoint) {
                const [wx2, wz2] = toScreen(game.waypoint.x, game.waypoint.z);
                const hint2 = game.getNavHint ? game.getNavHint() : null;
                const pm = hint2 && hint2.dist !== undefined
                    ? hint2.dist
                    : Math.hypot(game.waypoint.x - game.player.pos.x, game.waypoint.z - game.player.pos.z);
                let plabel = 'WAYPOINT · ' + (pm >= 1000 ? (pm / 1000).toFixed(1) + ' km' : Math.round(pm) + ' m');
                if (hint2 && hint2.text) plabel = hint2.text + ' → ' + plabel;
                ctx.beginPath(); ctx.arc(wx2, wz2, 11 * dpr, 0, TAU);
                ctx.strokeStyle = WP_COLOR; ctx.lineWidth = 2.5 * dpr; ctx.stroke();
                ctx.beginPath(); ctx.arc(wx2, wz2, 6 * dpr, 0, TAU);
                ctx.fillStyle = WP_COLOR; ctx.fill();
                ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke();
                ctx.font = '700 ' + Math.round(11 * dpr) + 'px -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3.5 * dpr; ctx.strokeStyle = 'rgba(5,10,18,0.9)';
                ctx.strokeText(plabel, wx2, wz2 - (14 * dpr));
                ctx.fillStyle = WP_COLOR;
                ctx.fillText(plabel, wx2, wz2 - (14 * dpr));
            }
            // Player arrow (heading, not camera yaw — it's a north-up map).
            const p = game.player;
            const [pxx, pzz] = toScreen(p.pos.x, p.pos.z);
            ctx.save();
            ctx.translate(pxx, pzz);
            ctx.rotate(-(p.heading || 0));
            const ar = 9 * dpr;
            ctx.beginPath();
            ctx.moveTo(0, -ar); ctx.lineTo(ar * 0.72, ar); ctx.lineTo(0, ar * 0.4); ctx.lineTo(-ar * 0.72, ar);
            ctx.closePath();
            ctx.fillStyle = '#fff'; ctx.fill();
            ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#0b1524'; ctx.stroke();
            ctx.restore();
            // North arrow + scale bar.
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '700 ' + Math.round(13 * dpr) + 'px -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('N ↑', 12 * dpr, 22 * dpr);
            const meters100 = 100 * kWorld;
            if (meters100 > 30) {
                const bx0 = 12 * dpr, by0 = H - 14 * dpr;
                ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2 * dpr;
                ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx0 + meters100, by0); ctx.stroke();
                ctx.font = '500 ' + Math.round(10 * dpr) + 'px -apple-system, sans-serif';
                ctx.fillText('100 m', bx0, by0 - 5 * dpr);
            }
            // Zone label = nearest landmark or district-ish fallback.
            try {
                let best = null, bd = Infinity;
                for (const lm of lms) {
                    const d = (lm.cx - p.pos.x) * (lm.cx - p.pos.x) + (lm.cz - p.pos.z) * (lm.cz - p.pos.z);
                    if (d < bd) { bd = d; best = lm; }
                }
                this._bigZone.textContent = best ? ('· near ' + best.name) : '';
            } catch (e) { /* ignore */ }
        }

        destroy() {
            try {
                const w = (this.win && this.win.ownerDocument && this.win.ownerDocument.defaultView) || window;
                if (this._bigKey) w.removeEventListener('keydown', this._bigKey, true);
            } catch (e) { /* ignore */ }
            try {
                if (this._bigRoot && this._bigRoot.parentNode) this._bigRoot.parentNode.removeChild(this._bigRoot);
            } catch (e) { /* ignore */ }
            this._bigOpen = false;
            this._game = null;
        }
    }
