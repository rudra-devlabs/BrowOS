class StarshipGame {
    constructor(container) {
        this.container = container;
        this.canvas = container.querySelector('#starship-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.overlay = container.querySelector('#starship-overlay');
        this.startBtn = container.querySelector('#starship-start-btn');
        this.stationBtn = container.querySelector('#starship-station-btn');
        this.stationOverlay = container.querySelector('#starship-station');
        this.stationBackBtn = container.querySelector('#station-back-btn');
        this.stationList = container.querySelector('#station-ships-list');
        this.scoreMsg = container.querySelector('#starship-score-msg');
        this.creditsMsg = container.querySelector('#starship-credits-msg');
        this.stationCreditsDisplay = container.querySelector('#station-credits-display');
        
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Game state
        this.state = 'menu'; // menu, playing, gameover, dying, station
        this.score = 0;
        this.credits = 1000; // start with some credits so they can buy one
        this.lives = 3;
        this.level = 1;
        
        // Ships Config
        this.ships = [
            { id: 0, name: "Scout Class", cost: 0, color: '#63b3ed', speed: 5, cooldown: 15, shots: 1, desc: "Standard single laser" },
            { id: 1, name: "Twin-Fang", cost: 1000, color: '#48bb78', speed: 6, cooldown: 12, shots: 2, desc: "Dual parallel lasers, slightly faster" },
            { id: 2, name: "Tri-Strike", cost: 3500, color: '#f6e05e', speed: 5, cooldown: 15, shots: 3, desc: "3-way spread shot" },
            { id: 3, name: "Dreadnought", cost: 10000, color: '#9f7aea', speed: 7, cooldown: 10, shots: 5, desc: "5-way massive spread shot, high speed" }
        ];
        this.unlockedShips = [0];
        this.currentShipId = 0;
        
        this.keys = {};
        this.particles = [];
        this.stars = [];
        
        this.player = { x: this.width/2, y: this.height - 50, w: 44, h: 32, speed: 5, cooldown: 0 };

        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.enemyDir = 1;
        this.enemySpeed = 1;
        this.enemyStepY = 0;
        
        this.invaderSprite = [
            [0,0,1,0,0,0,0,0,1,0,0],
            [0,0,0,1,0,0,0,1,0,0,0],
            [0,0,1,1,1,1,1,1,1,0,0],
            [0,1,1,0,1,1,1,0,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1],
            [1,0,1,1,1,1,1,1,1,0,1],
            [1,0,1,0,0,0,0,0,1,0,1],
            [0,0,0,1,1,0,1,1,0,0,0]
        ];
        
        this.playerSprite = [
            [0,0,0,0,0,1,0,0,0,0,0],
            [0,0,0,0,1,1,1,0,0,0,0],
            [0,0,0,0,1,1,1,0,0,0,0],
            [0,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1],
            [1,0,0,1,0,0,0,1,0,0,1],
            [1,0,0,1,0,0,0,1,0,0,1]
        ];

        this.initStars();
        this.bindEvents();
        
        // Start background loop
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initStars() {
        for (let i=0; i<100; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                s: Math.random() * 2 + 1,
                v: Math.random() * 0.5 + 0.1,
                c: Math.random() > 0.5 ? '#fff' : (Math.random() > 0.5 ? '#f6e05e' : '#63b3ed')
            });
        }
    }

    bindEvents() {
        // We attach listeners to the window so we don't lose focus
        this.keydownHandler = (e) => { this.keys[e.code] = true; };
        this.keyupHandler = (e) => { this.keys[e.code] = false; };
        
        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
        
        this.startBtn.addEventListener('click', () => this.startGame());
        this.stationBtn.addEventListener('click', () => this.openStation());
        this.stationBackBtn.addEventListener('click', () => this.closeStation());
        
        // Clean up when window closes (BrowOS specific trick if possible, otherwise we just keep running)
        // If the container is removed from DOM, we should stop the loop.
    }

    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.overlay.style.display = 'none';
        
        // Apply active ship stats
        const activeShip = this.ships.find(s => s.id === this.currentShipId);
        this.player.speed = activeShip.speed;
        this.player.cooldown = 0; // ready to fire
        
        this.initLevel();
    }
    
    openStation() {
        this.state = 'station';
        this.overlay.style.display = 'none';
        this.stationOverlay.style.display = 'flex';
        this.updateStationUI();
    }
    
    closeStation() {
        this.state = 'menu';
        this.stationOverlay.style.display = 'none';
        this.overlay.style.display = 'flex';
        this.creditsMsg.textContent = `Credits: ${this.credits}`;
    }
    
    updateStationUI() {
        this.stationCreditsDisplay.textContent = `Credits: ${this.credits}`;
        this.stationList.innerHTML = '';
        
        this.ships.forEach(ship => {
            const isUnlocked = this.unlockedShips.includes(ship.id);
            const isEquipped = this.currentShipId === ship.id;
            
            const row = document.createElement('div');
            row.style.cssText = `background: rgba(0,0,0,0.5); border: 1px solid ${ship.color}; padding: 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-family: monospace;`;
            
            const info = document.createElement('div');
            info.innerHTML = `<div style="color: ${ship.color}; font-size: 18px; font-weight: bold; margin-bottom: 5px;">${ship.name}</div>
                              <div style="color: #A0AEC0; font-size: 12px;">${ship.desc}</div>`;
            
            const actionBtn = document.createElement('button');
            actionBtn.style.cssText = `padding: 8px 16px; border: none; font-family: monospace; font-size: 14px; cursor: pointer; border-radius: 4px;`;
            
            if (isEquipped) {
                actionBtn.textContent = 'EQUIPPED';
                actionBtn.style.background = '#2d3748';
                actionBtn.style.color = '#A0AEC0';
                actionBtn.disabled = true;
            } else if (isUnlocked) {
                actionBtn.textContent = 'EQUIP';
                actionBtn.style.background = ship.color;
                actionBtn.style.color = '#000';
                actionBtn.onclick = () => {
                    this.currentShipId = ship.id;
                    this.updateStationUI();
                };
            } else {
                actionBtn.textContent = `BUY (${ship.cost})`;
                actionBtn.style.background = 'transparent';
                actionBtn.style.border = `1px solid ${ship.color}`;
                actionBtn.style.color = ship.color;
                actionBtn.onclick = () => {
                    if (this.credits >= ship.cost) {
                        this.credits -= ship.cost;
                        this.unlockedShips.push(ship.id);
                        this.currentShipId = ship.id;
                        this.updateStationUI();
                    } else {
                        actionBtn.textContent = 'NOT ENOUGH';
                        setTimeout(() => this.updateStationUI(), 1000);
                    }
                };
            }
            
            row.appendChild(info);
            row.appendChild(actionBtn);
            this.stationList.appendChild(row);
        });
    }
    
    initLevel() {
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.particles = [];
        this.player.x = this.width / 2;
        this.enemyDir = 1;
        this.enemySpeed = 1 + (this.level * 0.2);
        
        const maxRows = 8;
        const rows = Math.min(maxRows, 3 + Math.floor(this.level / 2));
        const cols = 9;
        const spacingX = 55;
        const spacingY = 40;
        const startX = (this.width - (cols * spacingX)) / 2;
        
        for (let r=0; r<rows; r++) {
            for (let c=0; c<cols; c++) {
                this.enemies.push({
                    x: startX + c * spacingX,
                    y: 50 + r * spacingY,
                    w: 33,
                    h: 24,
                    row: r
                });
            }
        }
    }

    createExplosion(x, y, color, count) {
        // Intentionally high particle count for visually intense explosions
        for (let i=0; i<count; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.01,
                size: Math.random() * 4 + 1,
                color: color
            });
        }
    }

    update(dt) {
        // Update Stars (Always)
        this.stars.forEach(s => {
            s.y += s.v;
            if (s.y > this.height) s.y = 0;
        });

        // Update Particles (Always)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        if (this.state !== 'playing' && this.state !== 'dying') return;

        // Player movement
        if (this.state === 'playing') {
            if ((this.keys['ArrowLeft'] || this.keys['KeyA']) && this.player.x > this.player.w/2) {
                this.player.x -= this.player.speed;
            }
            if ((this.keys['ArrowRight'] || this.keys['KeyD']) && this.player.x < this.width - this.player.w/2) {
                this.player.x += this.player.speed;
            }
            
            // Player shooting
            if (this.player.cooldown > 0) this.player.cooldown--;
            if ((this.keys['Space'] || this.keys['ArrowUp'] || this.keys['KeyW']) && this.player.cooldown <= 0) {
                const ship = this.ships.find(s => s.id === this.currentShipId);
                const shots = ship.shots;
                
                if (shots === 1) {
                    this.bullets.push({ x: this.player.x, y: this.player.y - this.player.h, w: 4, h: 15, vx: 0, vy: -10 });
                } else if (shots === 2) {
                    this.bullets.push({ x: this.player.x - 10, y: this.player.y - this.player.h, w: 4, h: 15, vx: 0, vy: -10 });
                    this.bullets.push({ x: this.player.x + 10, y: this.player.y - this.player.h, w: 4, h: 15, vx: 0, vy: -10 });
                } else if (shots === 3) {
                    this.bullets.push({ x: this.player.x, y: this.player.y - this.player.h, w: 4, h: 15, vx: 0, vy: -10 });
                    this.bullets.push({ x: this.player.x - 8, y: this.player.y - this.player.h, w: 4, h: 15, vx: -2, vy: -9 });
                    this.bullets.push({ x: this.player.x + 8, y: this.player.y - this.player.h, w: 4, h: 15, vx: 2, vy: -9 });
                } else if (shots === 5) {
                    this.bullets.push({ x: this.player.x, y: this.player.y - this.player.h, w: 4, h: 15, vx: 0, vy: -10 });
                    this.bullets.push({ x: this.player.x - 10, y: this.player.y - this.player.h, w: 4, h: 15, vx: -2, vy: -9 });
                    this.bullets.push({ x: this.player.x + 10, y: this.player.y - this.player.h, w: 4, h: 15, vx: 2, vy: -9 });
                    this.bullets.push({ x: this.player.x - 20, y: this.player.y - this.player.h, w: 4, h: 15, vx: -4, vy: -8 });
                    this.bullets.push({ x: this.player.x + 20, y: this.player.y - this.player.h, w: 4, h: 15, vx: 4, vy: -8 });
                }
                
                this.player.cooldown = ship.cooldown;
            }
        }

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.x += b.vx || 0;
            b.y += b.vy || -10;
            if (b.y < -20 || b.x < 0 || b.x > this.width) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Collision with enemies
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                let e = this.enemies[j];
                if (b.x > e.x - e.w/2 && b.x < e.x + e.w/2 && b.y > e.y - e.h/2 && b.y < e.y + e.h/2) {
                    this.createExplosion(e.x, e.y, '#ff3366', 150); // Massive explosion
                    this.score += 10 * this.level;
                    this.credits += 10 * this.level; // Earn credits
                    this.enemies.splice(j, 1);
                    this.bullets.splice(i, 1);
                    hit = true;
                    break;
                }
            }
        }

        // Enemy movement & shooting
        let hitEdge = false;
        let bottomMost = 0;
        
        this.enemies.forEach(e => {
            e.x += this.enemySpeed * this.enemyDir;
            if (e.x < e.w/2 || e.x > this.width - e.w/2) hitEdge = true;
            if (e.y > bottomMost) bottomMost = e.y;
            
            // Random shooting
            if (Math.random() < Math.min(0.02, 0.0005 * this.level)) {
                this.enemyBullets.push({ x: e.x, y: e.y + e.h/2, w: 4, h: 15 });
            }
        });
        
        if (hitEdge) {
            this.enemyDir *= -1;
            this.enemies.forEach(e => { e.y += 20; e.x += this.enemySpeed * this.enemyDir; });
        }

        // Check if enemies reached bottom
        if (bottomMost > this.player.y - this.player.h && this.state === 'playing') {
            this.state = 'dying';
            this.lives = 0;
            this.createExplosion(this.player.x, this.player.y, '#63b3ed', 300);
            setTimeout(() => this.gameOver(), 1500);
        }

        // Update Enemy Bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            let b = this.enemyBullets[i];
            b.y += 6;
            if (b.y > this.height) {
                this.enemyBullets.splice(i, 1);
                continue;
            }
            
            // Collision with player
            if (this.lives > 0 && b.x > this.player.x - this.player.w/2 && b.x < this.player.x + this.player.w/2 && 
                b.y > this.player.y - this.player.h/2 && b.y < this.player.y + this.player.h/2) {
                
                this.createExplosion(this.player.x, this.player.y, '#63b3ed', 300); // Huge explosion
                this.enemyBullets.splice(i, 1);
                this.lives--;
                
                if (this.lives <= 0) {
                    this.state = 'dying'; // New transition state
                    setTimeout(() => this.gameOver(), 1500); // Wait 1.5s before overlay
                } else {
                    // Temporarily clear bullets
                    this.enemyBullets = [];
                }
            }
        }
        
        // Check win level
        if (this.enemies.length === 0 && this.state === 'playing') {
            this.level++;
            this.initLevel();
        }
    }
    
    gameOver() {
        this.state = 'gameover';
        this.overlay.style.display = 'flex';
        this.overlay.querySelector('h1').textContent = 'GAME OVER';
        this.scoreMsg.style.display = 'block';
        this.scoreMsg.textContent = `Final Score: ${this.score}`;
        this.startBtn.textContent = 'PLAY AGAIN';
    }

    drawSprite(x, y, sprite, pixelSize, color) {
        this.ctx.fillStyle = color;
        const w = sprite[0].length * pixelSize;
        const h = sprite.length * pixelSize;
        const startX = x - w/2;
        const startY = y - h/2;
        
        for (let r=0; r<sprite.length; r++) {
            for (let c=0; c<sprite[r].length; c++) {
                if (sprite[r][c]) {
                    this.ctx.fillRect(startX + c*pixelSize, startY + r*pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }

    draw() {
        // Clear background
        this.ctx.fillStyle = '#00001a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw Stars
        this.stars.forEach(s => {
            this.ctx.fillStyle = s.c;
            this.ctx.fillRect(s.x, s.y, s.s, s.s);
        });

        if (this.state === 'playing' || this.state === 'gameover' || this.state === 'dying') {
            // Draw Player
            if (this.lives > 0) {
                const activeShip = this.ships.find(s => s.id === this.currentShipId);
                this.drawSprite(this.player.x, this.player.y, this.playerSprite, 4, activeShip.color);
            }
            
            // Draw Enemies
            this.enemies.forEach(e => {
                const color = e.row % 2 === 0 ? '#ff3366' : '#f6e05e';
                this.drawSprite(e.x, e.y, this.invaderSprite, 3, color);
            });
            
            // Draw Player Bullets
            const activeShipColor = this.ships.find(s => s.id === this.currentShipId).color;
            this.ctx.fillStyle = activeShipColor;
            this.bullets.forEach(b => {
                this.ctx.fillRect(b.x - b.w/2, b.y, b.w, b.h);
            });
            
            // Draw Enemy Bullets
            this.ctx.fillStyle = '#ff3366';
            this.enemyBullets.forEach(b => {
                this.ctx.fillRect(b.x - b.w/2, b.y, b.w, b.h);
            });
            
            // Draw Particles
            this.particles.forEach(p => {
                this.ctx.globalAlpha = p.life;
                this.ctx.fillStyle = p.color;
                this.ctx.fillRect(p.x, p.y, p.size, p.size);
            });
            this.ctx.globalAlpha = 1.0;
            
            // HUD
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, this.width, 40);
            
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '20px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`SCORE: ${this.score}`, 10, 28);
            
            this.ctx.textAlign = 'right';
            this.ctx.fillText(`LIVES: ${this.lives}`, this.width - 10, 28);
            
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`WAVE: ${this.level}`, this.width / 2, 28);
        }
    }

    loop(time) {
        // If the window is closed, the canvas will be removed from DOM. Stop the loop.
        if (!document.body.contains(this.canvas)) {
            window.removeEventListener('keydown', this.keydownHandler);
            window.removeEventListener('keyup', this.keyupHandler);
            return; 
        }

        const dt = time - this.lastTime;
        this.lastTime = time;
        
        this.update(dt);
        this.draw();
        
        requestAnimationFrame((t) => this.loop(t));
    }
}

// Global hook to initialize the game when the window is opened
window.initStarshipGame = (windowEl) => {
    if (windowEl.querySelector('.starship-window')) {
        new StarshipGame(windowEl);
    }
};