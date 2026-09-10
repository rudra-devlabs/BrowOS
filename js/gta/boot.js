    // ===========================================================================
    // BOOT — BrowOS app entry
    // ===========================================================================
    window.initGtaGame = function (windowEl) {
        if (windowEl.__gtaInstance) return;
        const game = new Game(windowEl);
        windowEl.__gtaInstance = game;

        // Callable & chainable gta helper
        const gtaFn = function (cmd, arg) {
            if (Array.isArray(cmd)) cmd = cmd.join(' '); // Tagged template: gta`time noon` or gta`sunset`
            if (typeof cmd === 'string') {
                const parts = cmd.trim().split(/\s+/);
                if (parts[0] === 'time' && parts[1]) return game.dayNight?.setTime(parts[1]);
                if (parts[0] === 'advance') return game.dayNight?.advanceTime(parseFloat(parts[1]) || 3);
                return game.dayNight?.setTime(parts[0]);
            }
            if (typeof cmd === 'number') return game.dayNight?.setTime(cmd);
            return game;
        };
        Object.setPrototypeOf(gtaFn, game);
        Object.assign(gtaFn, game);

        const timeFn = function (h) { return game.dayNight?.setTime(h); };
        Object.defineProperty(gtaFn, 'time', {
            configurable: true,
            get() { return timeFn; },
            set(val) { if (game.dayNight) game.dayNight.setTime(val); }
        });
        gtaFn.advance = (h) => game.dayNight?.advanceTime(h);
        gtaFn.setTime = (h) => game.dayNight?.setTime(h);
        gtaFn.advanceTime = (h) => game.dayNight?.advanceTime(h);
        gtaFn.aim = (on) => {
            if (game.player) {
                if (on === undefined) on = !game.player.aiming;
                game.input.altAim = !!on;
                game.input.aim = !!on;
                game.player.aiming = !!on;
                if (on && (game.player.weapon === 'fist' || game.player.weapon === 'bat')) {
                    game.player.selectWeapon('pistol', game.hud);
                }
                return { aiming: game.player.aiming, weapon: game.player.weapon };
            }
        };
        gtaFn.shoot = () => {
            if (game.player && !game.player.inVehicle) {
                if (game.player.weapon === 'fist' || game.player.weapon === 'bat') {
                    game.player.selectWeapon('pistol', game.hud);
                }
                game.player.aiming = true;
                game.input.aim = true;
                game.input.fire = true;
                const shot = game.player.fire(game.fx);
                game.handleAttack(0);
                game.input.fire = false;
                return shot;
            }
        };
        gtaFn.weapon = (w) => {
            if (game.player) {
                if (w) game.player.selectWeapon(w, game.hud);
                return game.player.weapon;
            }
        };
        Object.defineProperty(gtaFn, 'shootMode', {
            get() { return game.shootMode; },
            set(v) { game.shootMode = v; }
        });
        gtaFn.game = game;
        gtaFn.buy = (item) => game.buyGunShopItem(typeof item === 'string' ? { id: item, name: item, price: 0 } : item);
        gtaFn.eat = (item) => game.eatFoodItem(typeof item === 'string' ? { name: item, heal: 30, price: 0 } : item);
        gtaFn.shops = () => ({ gunShops: game.gunShops, foodShops: game.foodShops, foodStalls: game.foodStalls });
        window.gtaGame = game;
        window.gta = gtaFn;

        // Global functions on window
        window.setTime = (h) => game.dayNight ? game.dayNight.setTime(h) : null;
        window.advanceTime = (h = 3) => game.dayNight ? game.dayNight.advanceTime(h) : null;
        window.getTime = () => game.dayNight ? game.dayNight.getTime() : null;

        // Zero-punctuation single word getters in console (type 'noon', 'sunset', 'night', 'dawn', 'midnight')
        ['noon', 'sunset', 'night', 'dawn', 'midnight', 'day'].forEach(name => {
            try {
                Object.defineProperty(window, name, {
                    configurable: true,
                    get() {
                        if (game.dayNight) return game.dayNight.setTime(name);
                        return name;
                    }
                });
                Object.defineProperty(gtaFn, name, {
                    configurable: true,
                    get() {
                        if (game.dayNight) return game.dayNight.setTime(name);
                        return name;
                    }
                });
                Object.defineProperty(timeFn, name, {
                    configurable: true,
                    get() {
                        if (game.dayNight) return game.dayNight.setTime(name);
                        return name;
                    }
                });
            } catch (e) {}
        });

        console.log('%c[Brow City Day-Night Controls Ready]', 'color: #34c759; font-weight: bold;');
        console.log('You can type any of these in this console:');
        console.log('  setTime("noon")  or  setTime("sunset")  or  setTime("night")  or  setTime(18.5)');
        console.log('  gta("time noon") or  gta("sunset")  or  gta.time("night")');
        console.log('  Or simply type: noon, sunset, night, dawn, midnight');
    };