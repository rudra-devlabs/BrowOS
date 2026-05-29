// BrowRacer: Retro Pseudo-3D Highway Car Racing Game for BrowOS
(function() {
    window.initBrowRacerGame = function(windowElement) {
        const canvas = windowElement.querySelector('#racer-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const startOverlay = windowElement.querySelector('#racer-overlay');
        const startBtn = windowElement.querySelector('#racer-start-btn');
        const scoreMsg = windowElement.querySelector('#racer-score-msg');
        const titleText = windowElement.querySelector('#racer-title-text');

        // Web Audio API context for sound synthesis
        let audioCtx = null;
        let motorOsc = null;
        let motorGain = null;

        // Key states
        const keys = { left: false, right: false, up: false, down: false };

        // Game parameters
        const fps = 60;
        const step = 1 / fps;
        let width = 600;
        let height = 400;
        const roadWidth = 2000;
        const segmentLength = 200;
        const rumbleLength = 3;
        const cameraHeight = 1000;
        const fieldOfView = 100; // FOV
        const cameraDepth = 1 / Math.tan((fieldOfView / 2) * Math.PI / 180);
        const drawDistance = 200;
        const playerZ = cameraHeight * cameraDepth;

        const maxSpeed = 260; // Max speed (mph)
        const accel = 60; // Acceleration
        const breaking = -120; // Braking
        const decel = -30; // Passive deceleration
        const offRoadDecel = -100; // Deceleration when driving off the road
        const offRoadLimit = 80; // Speed limit on grass

        // State variables
        let segments = [];
        let cars = [];
        let position = 0;
        let playerX = 0; // -1 (left road edge) to 1 (right road edge)
        let speed = 0;
        let distance = 0;
        let gameTime = 0;
        let totalTime = 45; // Time limit (seconds)
        let score = 0;
        let highScores = [];
        let active = false;
        let checkpointZ = 20000; // Next checkpoint location

        // Load scores from virtual filesystem
        async function loadHighScores() {
            if (window.filesystem && typeof window.filesystem.readFile === 'function') {
                try {
                    const content = await window.filesystem.readFile('Desktop/Highscores.txt');
                    if (content) {
                        highScores = content.split('\n')
                            .map(s => parseInt(s.trim()))
                            .filter(s => !isNaN(s))
                            .sort((a, b) => b - a);
                    }
                } catch (e) {
                    console.log('Highscores file does not exist yet.');
                }
            }
        }

        // Save new high score to virtual filesystem
        async function saveHighScore(newScore) {
            highScores.push(newScore);
            highScores.sort((a, b) => b - a);
            highScores = highScores.slice(0, 5); // Keep top 5

            if (window.filesystem && typeof window.filesystem.createFile === 'function') {
                try {
                    await window.filesystem.createFile('Desktop/Highscores.txt', highScores.join('\n'));
                    
                    // Refresh desktop icons and file explorer
                    if (window.desktop && typeof window.desktop.refreshDesktopIcons === 'function') {
                        window.desktop.refreshDesktopIcons();
                    }
                    if (window.filebrowApp && typeof window.filebrowApp.render === 'function') {
                        window.filebrowApp.render();
                    }
                } catch (e) {
                    console.error('Failed to log highscore:', e);
                }
            }
        }

        // Audio synthesis helpers
        function initAudio() {
            if (audioCtx) return;
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            // Create motor hum
            motorOsc = audioCtx.createOscillator();
            motorOsc.type = 'sawtooth';
            motorOsc.frequency.value = 50;

            // Lowpass filter to make it sound beefier like a car engine
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 350;

            motorGain = audioCtx.createGain();
            motorGain.gain.value = 0.0;

            motorOsc.connect(filter);
            filter.connect(motorGain);
            motorGain.connect(audioCtx.destination);
            motorOsc.start(0);
        }

        function playCrashSound() {
            if (!audioCtx) return;

            // Generate a burst of white noise for crash sound
            const bufferSize = audioCtx.sampleRate * 0.4; // 0.4 seconds
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = buffer;

            // Create bandpass filter for metallic grinding crash sound
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 600;

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            noiseGain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

            noiseNode.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noiseNode.start(0);
        }

        function playCheckpointSound() {
            if (!audioCtx) return;

            const now = audioCtx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

            notes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = freq;
                
                gain.gain.setValueAtTime(0.12, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.3);
            });
        }

        // Road Geometry Generation
        function addRoadSegment(curve, y) {
            segments.push({
                index: segments.length,
                p1: { world: { x: 0, y: segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y, z: segments.length * segmentLength }, screen: { x: 0, y: 0, w: 0 } },
                p2: { world: { x: 0, y: y, z: (segments.length + 1) * segmentLength }, screen: { x: 0, y: 0, w: 0 } },
                curve: curve,
                color: Math.floor(segments.length / rumbleLength) % 2 ? { road: '#2a2a35', grass: '#080810', curb: '#ff3366', lane: '#ffffff' } : { road: '#202028', grass: '#050508', curb: '#ffffff', lane: '#000000' }
            });
        }

        function addRoadSection(length, curve, hill) {
            const startY = segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
            for (let i = 0; i < length; i++) {
                // Smooth sinusoidal transition for hills and curves
                const ratio = Math.sin((i / length) * Math.PI / 2);
                addRoadSegment(curve * ratio, startY + hill * ratio * 200);
            }
        }

        function generateTrack() {
            segments = [];
            addRoadSection(100, 0, 0);       // Straight flat start
            addRoadSection(120, 2, 2);       // Curved rising hill
            addRoadSection(80, 0, -3);       // Flat slope drop
            addRoadSection(150, -3, 1);      // Left sweeping incline
            addRoadSection(100, 3, -1);      // Right sweeping decline
            addRoadSection(80, -1, 0);       // Short counter curve
            addRoadSection(120, 0, 4);       // Roller-coaster hill incline
            addRoadSection(120, 0, -4);      // Big hill drop
            addRoadSection(150, 4, 1);       // Sharp sweeping curve
            addRoadSection(100, 0, 0);       // Straight flat final sprint
        }

        const trackLength = () => segments.length * segmentLength;

        // Traffic AI Generation
        function generateTraffic() {
            cars = [];
            for (let i = 0; i < 35; i++) {
                const z = 2000 + i * 1500 + Math.random() * 500;
                const lane = Math.floor(Math.random() * 3) - 1; // -1 (left), 0 (center), 1 (right)
                cars.push({
                    id: i,
                    z: z,
                    x: lane * 0.6,
                    speed: 80 + Math.random() * 60, // Opponent speed (mph)
                    color: `hsl(${Math.random() * 360}, 80%, 60%)`
                });
            }
        }

        // 3D Projection Math
        function project(p, cameraX, cameraY, cameraZ) {
            p.camera = {
                x: (p.world.x || 0) - cameraX,
                y: (p.world.y || 0) - cameraY,
                z: (p.world.z || 0) - cameraZ
            };
            p.screen.scale = cameraDepth / p.camera.z;
            p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
            p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
            p.screen.w = Math.round(p.screen.scale * roadWidth * width / 2);
        }

        // Game State Update loop
        function update(dt) {
            if (!active) return;

            // Timer count down
            totalTime = Math.max(0, totalTime - dt);
            if (totalTime <= 0) {
                endGame();
                return;
            }

            const currentSegment = Math.floor(position / segmentLength) % segments.length;
            const segment = segments[currentSegment];
            const percent = (position % segmentLength) / segmentLength;

            // Steer mechanics (higher speed -> lower steering capability to simulate inertia)
            const speedRatio = speed / maxSpeed;
            const steerRate = 2.4 * (1 - speedRatio * 0.4);

            if (keys.left) playerX -= steerRate * dt;
            if (keys.right) playerX += steerRate * dt;

            // Auto-align back to center slightly if steering keys are not held
            if (!keys.left && !keys.right) {
                playerX -= (playerX * 1.5 * dt);
            }

            // Passive road-curvature force
            const playerCurveForce = speedRatio * segment.curve * 1.6;
            playerX -= playerCurveForce * dt;

            // Acceleration / Deceleration physics
            if (keys.up) {
                speed += accel * dt;
            } else if (keys.down) {
                speed += breaking * dt;
            } else {
                speed += decel * dt;
            }

            // Drive off road (grass deceleration penalty)
            const playerOffRoad = playerX < -1.0 || playerX > 1.0;
            if (playerOffRoad) {
                if (speed > offRoadLimit) {
                    speed += offRoadDecel * dt;
                }
            }

            // Cap speed limits
            speed = Math.max(0, Math.min(speed, maxSpeed));

            // Camera movement along track
            position += speed * 1.467 * dt * segmentLength / 60; // scale meters-per-second
            if (position >= trackLength()) {
                position -= trackLength();
                // Pass final loop track lap
                score += 5000;
                totalTime += 20; // lap complete reward
                checkpointZ = 20000;
                playCheckpointSound();
            }

            distance += speed * dt * 0.000277; // converted to miles
            score += Math.round(speed * 0.05);

            // Pass checkpoints every 20,000 meters
            if (position > checkpointZ) {
                checkpointZ += 20000;
                totalTime = Math.min(99, totalTime + 15);
                score += 1500;
                playCheckpointSound();
            }

            // Constrain player drift values
            playerX = Math.max(-2.0, Math.min(2.0, playerX));

            // Update opponent cars AI
            cars.forEach(car => {
                const oldZ = car.z;
                car.z += car.speed * 1.467 * dt * segmentLength / 60;
                if (car.z >= trackLength()) car.z -= trackLength();

                // Collision detection with traffic cars
                const playerSegment = Math.floor(position / segmentLength) % segments.length;
                const carSegment = Math.floor(car.z / segmentLength) % segments.length;

                if (playerSegment === carSegment) {
                    const zDiff = Math.abs(car.z - (position + playerZ));
                    if (zDiff < 250) { // close enough on Z axis
                        const xDiff = Math.abs(playerX - car.x);
                        if (xDiff < 0.5) { // collided on X axis
                            // Play crash noise, shake screen, reduce speed!
                            playCrashSound();
                            speed = speed * 0.35; // major speed drop
                            car.speed += 80;      // push opponent car away
                            score = Math.max(0, score - 800);
                            
                            // Trigger dynamic screen rumble effect
                            canvas.style.transform = 'translate(6px, -4px)';
                            setTimeout(() => canvas.style.transform = 'none', 120);
                        }
                    }
                }
            });

            // Dynamically adjust audio engine pitch hum based on speed!
            if (audioCtx && motorOsc && motorGain) {
                motorGain.gain.setValueAtTime(0.08 + (speedRatio * 0.08), audioCtx.currentTime);
                // Pitch frequency goes from 45Hz (idle) to 220Hz (max speed)
                motorOsc.frequency.setValueAtTime(45 + (speedRatio * 180), audioCtx.currentTime);
            }
        }

        // Render Canvas Pipeline
        function draw() {
            ctx.clearRect(0, 0, width, height);

            const currentSegment = Math.floor(position / segmentLength) % segments.length;
            const baseSegment = segments[currentSegment];
            const percent = (position % segmentLength) / segmentLength;
            
            const playerSegmentY = baseSegment.p1.world.y + (baseSegment.p2.world.y - baseSegment.p1.world.y) * percent;

            let maxy = height;
            let x = 0;
            let dx = -(baseSegment.curve * percent);

            // 1. Draw Parallax Background Layers (Grid Sun, Mountains, Stars)
            drawBackground(baseSegment.curve * percent);

            // 2. Draw Road Segments (Painter's back-to-front rendering)
            for (let i = 0; i < drawDistance; i++) {
                const segmentIndex = (currentSegment + i) % segments.length;
                const segment = segments[segmentIndex];
                
                // Track wraps loops around
                const loopZ = (segmentIndex < currentSegment) ? trackLength() : 0;
                
                project(segment.p1, playerX * roadWidth - x, playerSegmentY + cameraHeight, position - loopZ);
                project(segment.p2, playerX * roadWidth - x - dx, playerSegmentY + cameraHeight, position - loopZ);

                x = x + dx;
                dx = dx + segment.curve;

                // Segment is completely behind camera
                if (segment.p1.camera.z <= cameraHeight) continue;
                // Segment is out of viewport scope
                if (segment.p2.screen.y >= maxy || segment.p2.screen.y >= segment.p1.screen.y) continue;

                // Draw grass, curbs, and asphalt road lanes
                drawSegment(segment.p1.screen, segment.p2.screen, segment.color);
                maxy = segment.p1.screen.y;
            }

            // 3. Draw Traffic opponent cars
            for (let i = drawDistance - 1; i > 0; i--) {
                const segmentIndex = (currentSegment + i) % segments.length;
                const segment = segments[segmentIndex];
                const loopZ = (segmentIndex < currentSegment) ? trackLength() : 0;

                cars.forEach(car => {
                    const carSeg = Math.floor(car.z / segmentLength) % segments.length;
                    if (carSeg === segmentIndex) {
                        project(segment.p1, playerX * roadWidth - (x - dx * (1 - i / drawDistance)), playerSegmentY + cameraHeight, position - loopZ);
                        drawOpponent(car, segment.p1.screen);
                    }
                });
            }

            // 4. Draw Player sports car
            drawPlayer();

            // 5. Draw dynamic floating glassmorphic telemetry HUD
            drawHUD();
        }

        // Rendering helper: Parallax Background
        function drawBackground(curveOffset) {
            // Draw sky/stars
            ctx.fillStyle = '#060610';
            ctx.fillRect(0, 0, width, height / 2);

            // Draw glowing wireframe grid sunset (synthwave style)
            const sunsetX = (width / 2) - (playerX * 45) - (curveOffset * 80);
            const gradient = ctx.createRadialGradient(sunsetX, height / 2.2, 5, sunsetX, height / 2.2, 140);
            gradient.addColorStop(0, '#ff3366');
            gradient.addColorStop(0.3, '#8b5cf6');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(sunsetX, height / 2, 90, 0, Math.PI, true);
            ctx.fill();

            // Distant wireframe mountains
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const mountainX = -(playerX * 15) - (curveOffset * 25);
            ctx.moveTo(mountainX - 100, height / 2);
            ctx.lineTo(mountainX + 50, height / 2 - 40);
            ctx.lineTo(mountainX + 160, height / 2 + 10);
            ctx.lineTo(mountainX + 280, height / 2 - 60);
            ctx.lineTo(mountainX + 410, height / 2 + 5);
            ctx.lineTo(mountainX + 530, height / 2 - 35);
            ctx.lineTo(mountainX + 700, height / 2);
            ctx.stroke();

            // Ground cover color
            ctx.fillStyle = '#050508';
            ctx.fillRect(0, height / 2, width, height / 2);
        }

        // Rendering helper: Road segment strip drawing
        function drawSegment(p1, p2, color) {
            // Draw Grass
            ctx.fillStyle = color.grass;
            ctx.fillRect(0, p2.y, width, p1.y - p2.y);

            // Draw Curbs
            ctx.fillStyle = color.curb;
            const curb1 = p1.w * 0.12;
            const curb2 = p2.w * 0.12;
            
            // Left Curb
            ctx.beginPath();
            ctx.moveTo(p1.x - p1.w - curb1, p1.y);
            ctx.lineTo(p1.x - p1.w, p1.y);
            ctx.lineTo(p2.x - p2.w, p2.y);
            ctx.lineTo(p2.x - p2.w - curb2, p2.y);
            ctx.fill();

            // Right Curb
            ctx.beginPath();
            ctx.moveTo(p1.x + p1.w, p1.y);
            ctx.lineTo(p1.x + p1.w + curb1, p1.y);
            ctx.lineTo(p2.x + p2.w + curb2, p2.y);
            ctx.lineTo(p2.x + p2.w, p2.y);
            ctx.fill();

            // Draw Asphalt Road
            ctx.fillStyle = color.road;
            ctx.beginPath();
            ctx.moveTo(p1.x - p1.w, p1.y);
            ctx.lineTo(p1.x + p1.w, p1.y);
            ctx.lineTo(p2.x + p2.w, p2.y);
            ctx.lineTo(p2.x - p2.w, p2.y);
            ctx.fill();

            // Center lane white separators
            if (color.lane) {
                ctx.fillStyle = color.lane;
                const laneW1 = p1.w * 0.02;
                const laneW2 = p2.w * 0.02;
                ctx.beginPath();
                ctx.moveTo(p1.x - laneW1, p1.y);
                ctx.lineTo(p1.x + laneW1, p1.y);
                ctx.lineTo(p2.x + laneW2, p2.y);
                ctx.lineTo(p2.x - laneW2, p2.y);
                ctx.fill();
            }
        }

        // Rendering helper: Opponent cars
        function drawOpponent(car, screen) {
            const size = screen.scale * 120 * (width / 2);
            const x = screen.x + (screen.scale * car.x * roadWidth * width / 2) - size / 2;
            const y = screen.y - size;

            if (x < -size || x > width + size) return; // out of screen clipping

            // Draw cartoonish opponent sports car
            ctx.fillStyle = car.color;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = Math.max(1, size * 0.03);

            // Car body
            ctx.beginPath();
            ctx.roundRect(x, y + size * 0.4, size, size * 0.45, size * 0.08);
            ctx.fill();
            ctx.stroke();

            // Windshield
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.moveTo(x + size * 0.15, y + size * 0.4);
            ctx.lineTo(x + size * 0.25, y + size * 0.15);
            ctx.lineTo(x + size * 0.75, y + size * 0.15);
            ctx.lineTo(x + size * 0.85, y + size * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Rear lights
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(x + size * 0.08, y + size * 0.5, size * 0.14, size * 0.08);
            ctx.fillRect(x + size * 0.78, y + size * 0.5, size * 0.14, size * 0.08);

            // Tires
            ctx.fillStyle = '#111';
            ctx.fillRect(x + size * 0.05, y + size * 0.8, size * 0.18, size * 0.1);
            ctx.fillRect(x + size * 0.77, y + size * 0.8, size * 0.18, size * 0.1);
        }

        // Rendering helper: Player car
        function drawPlayer() {
            const carSize = 130;
            const x = width / 2 - carSize / 2;
            const y = height - carSize - 10;

            // Draw player's signature red glassmorphic sports car
            ctx.fillStyle = '#ff3366'; // primary theme pink/red
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;

            // Wheels
            ctx.fillStyle = '#08080c';
            ctx.beginPath();
            ctx.roundRect(x + 6, y + carSize * 0.7, 24, 18, 4);
            ctx.roundRect(x + carSize - 30, y + carSize * 0.7, 24, 18, 4);
            ctx.fill();

            // Tail wing spoiler
            ctx.fillStyle = '#8b5cf6'; // accent secondary purple
            ctx.fillRect(x + 4, y + 2, carSize - 8, 8);
            ctx.fillRect(x + 12, y + 8, 8, 12);
            ctx.fillRect(x + carSize - 20, y + 8, 8, 12);

            // Car main body
            const gradient = ctx.createLinearGradient(x, y + 20, x + carSize, y + carSize);
            gradient.addColorStop(0, '#ff3366');
            gradient.addColorStop(1, '#8b5cf6');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x + 10, y + 16, carSize - 20, carSize * 0.64, 12);
            ctx.fill();
            ctx.stroke();

            // Glass canopy / Windshield
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.beginPath();
            ctx.roundRect(x + 24, y + 28, carSize - 48, carSize * 0.3, 6);
            ctx.fill();
            ctx.stroke();

            // Tail lights (glow red when braking)
            ctx.fillStyle = keys.down ? '#ff0000' : '#880000';
            ctx.shadowColor = keys.down ? '#ff0000' : 'transparent';
            ctx.shadowBlur = keys.down ? 10 : 0;
            ctx.fillRect(x + 18, y + carSize * 0.55, 18, 6);
            ctx.fillRect(x + carSize - 36, y + carSize * 0.55, 18, 6);
            ctx.shadowBlur = 0; // reset shadow
        }

        // Rendering helper: Neon HUD
        function drawHUD() {
            // Speed indicator overlay
            ctx.fillStyle = 'rgba(20, 20, 30, 0.65)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(14, 14, 140, 52, 10);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.round(speed)}`, 24, 40);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px monospace';
            ctx.fillText('MPH', 24, 52);

            // Timer display overlay
            ctx.fillStyle = 'rgba(20, 20, 30, 0.65)';
            ctx.beginPath();
            ctx.roundRect(width - 154, 14, 140, 52, 10);
            ctx.fill();
            ctx.stroke();

            // Pulsing timer alert if below 10 seconds
            ctx.fillStyle = totalTime < 10 ? '#ff3366' : '#ffffff';
            ctx.font = 'bold 22px monospace';
            ctx.fillText(`${totalTime.toFixed(1)}s`, width - 144, 40);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px monospace';
            ctx.fillText('TIME REMAINING', width - 144, 52);

            // Live score
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px monospace';
            ctx.fillText(`SCORE: ${score}`, 24, 85);
            ctx.fillText(`DIST: ${distance.toFixed(2)} mi`, 24, 102);

            // Next checkpoint distance
            const checkDist = Math.max(0, Math.round((checkpointZ - position) / segmentLength));
            ctx.fillStyle = '#8b5cf6';
            ctx.font = '11px monospace';
            ctx.fillText(`NEXT CHECKPOINT: ${checkDist}m`, 24, 120);
        }

        // Game state triggers
        function startGame() {
            initAudio();
            generateTrack();
            generateTraffic();
            
            position = 0;
            playerX = 0;
            speed = 0;
            distance = 0;
            totalTime = 45;
            score = 0;
            checkpointZ = 20000;
            active = true;

            startOverlay.style.display = 'none';

            let last = Date.now();
            function frame() {
                if (!active) return;
                const now = Date.now();
                const dt = Math.min(1, (now - last) / 1000); // delta-time caps
                last = now;

                update(dt);
                draw();
                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        async function endGame() {
            active = false;
            if (motorGain) motorGain.gain.value = 0.0; // mute engine

            // Log score to filesystem
            await saveHighScore(score);

            startOverlay.style.display = 'flex';
            titleText.textContent = 'GAME OVER';
            scoreMsg.style.display = 'block';
            scoreMsg.innerHTML = `Your Score: <strong style="color: #ff3366;">${score}</strong><br>Distance: ${distance.toFixed(2)} miles<br><br>Top High Scores:<br>${highScores.slice(0, 3).map((s, i) => `${i+1}. ${s} pts`).join('<br>') || 'None yet!'}`;
            startBtn.textContent = 'RACE AGAIN';
        }

        // Bind keyboard events
        windowElement.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
            if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
            if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
            if (e.key === 'ArrowDown' || e.key === 's') keys.down = true;
        });

        windowElement.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
            if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
            if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
            if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
        });

        // Click handler to trigger race start
        startBtn.addEventListener('click', startGame);

        // Pre-fetch scores on initial load
        loadHighScores();

        // Render initial screen preview
        drawBackground(0);
        // Draw centered idle sports car
        ctx.fillStyle = '#ff3366';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect((width / 2) - 65, height - 140, 130, 80, 12);
        ctx.fill();
        ctx.stroke();

        // Register window closing event listener to mute audio completely!
        windowElement.addEventListener('window-closing', () => {
            active = false;
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) {}
            }
        });
    };
})();
