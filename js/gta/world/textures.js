    // ===========================================================================
    // TEX — shared CanvasTexture factory
    // ===========================================================================
    /**
     * Every facade in the city shares ONE of ~10 small canvas textures.
     * Building walls are merged into chunk geometry with UV repeat baked into
     * the UVs (world meters / tile meters), so a single material serves the
     * whole island and per-building tint comes from vertex colors.
     * A facade tile is TILE_W wide and TILE_H tall (3 floors of 3.2 m).
     */
    const TILE_W = 8, TILE_H = 9.6, FLOOR_H = 3.2;

    function makeCanvasTexture(w, h, draw) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        draw(ctx, w, h);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
    }

    /** Draw one window with frame, sill and glass. */
    function drawWindow(ctx, x, y, w, h, opts) {
        const o = opts || {};
        ctx.fillStyle = o.frame || '#26221e';
        ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, o.glassTop || '#8fa8b8');
        g.addColorStop(0.55, o.glassMid || '#5a7080');
        g.addColorStop(1, o.glassBot || '#3d4f5c');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        // reflection slash
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.15, y + h);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.62, y);
        ctx.lineTo(x + w * 0.32, y + h);
        ctx.closePath();
        ctx.fill();
        // sill
        ctx.fillStyle = o.sill || '#00000030';
        ctx.fillRect(x - 2.5, y + h + 1, w + 5, 2.5);
        // mullion
        ctx.fillStyle = 'rgba(30,26,22,0.9)';
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
    }

    /** Brick course background with subtle noise. */
    function drawBrick(ctx, w, h, base, mortar) {
        ctx.fillStyle = mortar;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = base;
        const bh = 4, bw = 12;
        for (let y = 0; y < h; y += bh) {
            const off = (y / bh) % 2 === 0 ? 0 : bw / 2;
            for (let x = -bw; x < w + bw; x += bw) {
                if (((x + off) * 31 + y * 17) % 7 > 5) continue; // gaps
                ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
            }
        }
    }

    /**
     * The facade style set. Each entry: [key, drawFn]. All 128x256.
     * Styles ending in 'ground' are single-floor storefront tiles.
     */
    const FACADE_STYLES = {
        brickRed: (ctx, w, h) => {
            drawBrick(ctx, w, h, '#a85a44', '#c9b8a6');
            for (let f = 0; f < 3; f++) {
                const y = 20 + f * (h / 3);
                drawWindow(ctx, 14, y, 34, 44);
                drawWindow(ctx, 78, y, 34, 44);
            }
        },
        brickTenement: (ctx, w, h) => {
            drawBrick(ctx, w, h, '#8f4a38', '#b8a28e');
            for (let f = 0; f < 3; f++) {
                const y = 16 + f * (h / 3);
                drawWindow(ctx, 16, y, 32, 42, { glassMid: '#6b6f74' });
                drawWindow(ctx, 78, y, 32, 42, { glassMid: '#6b6f74' });
                // fire escape: vertical rails + platform
                ctx.fillStyle = 'rgba(20,18,16,0.55)';
                ctx.fillRect(52, y - 8, 3, h / 3 - 8);
                ctx.fillRect(50, y + 34, 26, 4);
                ctx.fillRect(46, y + 6, 3, 34);
                ctx.fillRect(72, y + 6, 3, 34);
            }
        },
        limestone: (ctx, w, h) => {
            ctx.fillStyle = '#cfc0a2';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#c2b190';
            for (let y = 0; y < h; y += 24) ctx.fillRect(0, y, w, 2);
            for (let f = 0; f < 3; f++) {
                const y = 14 + f * (h / 3);
                drawWindow(ctx, 12, y, 40, 52, { frame: '#4a4038', sill: '#8a7a5c' });
                drawWindow(ctx, 74, y, 40, 52, { frame: '#4a4038', sill: '#8a7a5c' });
            }
        },
        brownstone: (ctx, w, h) => {
            drawBrick(ctx, w, h, '#6e4634', '#8a6a54');
            for (let f = 0; f < 3; f++) {
                const y = 18 + f * (h / 3);
                const tall = f === 0 ? 58 : 46; // parlor floor windows are tallest
                drawWindow(ctx, 18, y, 36, tall, { frame: '#2e2620', glassMid: '#5a6a72' });
                drawWindow(ctx, 74, y, 36, tall, { frame: '#2e2620', glassMid: '#5a6a72' });
                // cornice band between floors
                ctx.fillStyle = '#5a3a2a';
                ctx.fillRect(0, f * (h / 3) - 3, w, 5);
            }
        },
        castIron: (ctx, w, h) => {
            ctx.fillStyle = '#9a9488';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#8a8478';
            ctx.fillRect(0, 0, 8, h); ctx.fillRect(w - 8, 0, 8, h);
            for (let f = 0; f < 3; f++) {
                const y = 12 + f * (h / 3);
                drawWindow(ctx, 16, y, 40, 56, { frame: '#3a362e', glassMid: '#7c8c98' });
                drawWindow(ctx, 72, y, 40, 56, { frame: '#3a362e', glassMid: '#7c8c98' });
            }
            // heavy cornice
            ctx.fillStyle = '#6e685c';
            ctx.fillRect(0, 0, w, 10);
        },
        glassBlue: (ctx, w, h) => {
            ctx.fillStyle = '#5a7d94';
            ctx.fillRect(0, 0, w, h);
            for (let f = 0; f < 3; f++) {
                const y = f * (h / 3);
                ctx.fillStyle = '#3d5c72'; // spandrel band
                ctx.fillRect(0, y + h / 3 - 14, w, 14);
                const g = ctx.createLinearGradient(0, y, 0, y + h / 3);
                g.addColorStop(0, '#a8c8dc');
                g.addColorStop(1, '#6a94ae');
                ctx.fillStyle = g;
                ctx.fillRect(0, y + 4, w, h / 3 - 18);
                ctx.fillStyle = 'rgba(20,30,40,0.5)';
                for (let x = 10; x < w; x += 16) ctx.fillRect(x, y + 4, 2, h / 3 - 18);
            }
        },
        glassTeal: (ctx, w, h) => {
            ctx.fillStyle = '#4e7d80';
            ctx.fillRect(0, 0, w, h);
            for (let f = 0; f < 3; f++) {
                const y = f * (h / 3);
                const g = ctx.createLinearGradient(0, y, 0, y + h / 3);
                g.addColorStop(0, '#9cc8c8');
                g.addColorStop(1, '#589494');
                ctx.fillStyle = g;
                ctx.fillRect(8, y + 4, w - 16, h / 3 - 12);
                ctx.fillStyle = '#2e4a4e';
                ctx.fillRect(w / 2 - 4, y, 8, h / 3); // vertical mullion
            }
        },
        deco: (ctx, w, h) => {
            ctx.fillStyle = '#c4b494';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#b0a080';
            for (let f = 0; f < 3; f++) {
                const y = f * (h / 3);
                ctx.fillRect(0, y, 10, h / 3);
                ctx.fillRect(w - 10, y, 10, h / 3);
                ctx.beginPath(); // chevron
                ctx.moveTo(w / 2, y + 8); ctx.lineTo(w / 2 + 12, y + 20); ctx.lineTo(w / 2, y + 32);
                ctx.lineTo(w / 2 - 12, y + 20); ctx.closePath();
                ctx.fill();
                drawWindow(ctx, 24, y + 16, 30, 40, { frame: '#3e362c' });
                drawWindow(ctx, 74, y + 16, 30, 40, { frame: '#3e362c' });
            }
        },
        storefront: (ctx, w, h) => {
            ctx.fillStyle = '#38322c';
            ctx.fillRect(0, 0, w, h);
            // awning band (tinted per building via vertex color)
            ctx.fillStyle = '#d84a3a';
            ctx.fillRect(0, 10, w, 34);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            for (let x = 0; x < w; x += 24) ctx.fillRect(x, 10, 12, 34);
            // shop windows
            ctx.fillStyle = '#141210';
            ctx.fillRect(8, 52, w - 16, h - 70);
            const g = ctx.createLinearGradient(0, 52, 0, h - 18);
            g.addColorStop(0, '#7c94a4'); g.addColorStop(1, '#2a343c');
            ctx.fillStyle = g;
            ctx.fillRect(12, 56, 46, h - 78);
            ctx.fillRect(68, 56, w - 80, h - 78);
            // door + neon sign
            ctx.fillStyle = '#2a241e';
            ctx.fillRect(56, 56, 12, h - 78);
            ctx.fillStyle = '#ffd24a';
            ctx.fillRect(18, 0, w - 36, 7);
        },
        roof: (ctx, w, h) => {
            ctx.fillStyle = '#565452';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 300; i++) {
                ctx.fillStyle = Math.random() > 0.5 ? '#5e5c5a' : '#4e4c4a';
                ctx.fillRect(Math.random() * w, Math.random() * h, 4, 4);
            }
            ctx.strokeStyle = '#4a4846';
            ctx.strokeRect(0, 0, w, h);
        },
    };

    /** The billboard / neon atlas — 8 bright panels, 256x128 each (1024x512). */
    function drawBillboardAtlas(ctx, w, h) {
        const panels = [
            ['#e83030', 'BROW'], ['#2a9de8', 'TIMES SQ'], ['#e8a020', 'PIZZA'],
            ['#30c060', 'BANK'], ['#d040b0', 'BROADWAY'], ['#f0e040', 'DEL I'],
            ['#4050e0', 'HOTEL'], ['#e06030', 'NOODLES'],
        ];
        const pw = 256, ph = 128;
        for (let i = 0; i < 8; i++) {
            const px = (i % 4) * pw, py = Math.floor(i / 4) * ph;
            const [bg, word] = panels[i];
            ctx.fillStyle = bg;
            ctx.fillRect(px + 4, py + 4, pw - 8, ph - 8);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 44px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(word, px + pw / 2, py + ph / 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 3;
            ctx.strokeRect(px + 8, py + 8, pw - 16, ph - 16);
        }
    }

    /**
     * GLSL wave summation generated from a land.js wave table, so the vertex
     * shader and the JS physics queries evaluate the SAME surface. Emits code
     * that accumulates wy (height), wgrad (analytic slopes) and wdisp
     * (Gerstner horizontal crest-sharpening, visual only).
     */
    function waveGLSL(waves) {
        const f5 = (n) => Number(n).toFixed(5);
        let s = '';
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            s += `float wph${i} = dot(vec2(${f5(w.dx)}, ${f5(w.dz)}), wp) * ${f5(w.freq)} + uTime * ${f5(w.speed)};\n`;
            s += `float wss${i} = sin(wph${i});\nfloat wcc${i} = cos(wph${i});\n`;
            s += `wy += ${f5(w.amp)} * wss${i};\n`;
            s += `wgrad += (${f5(w.amp * w.freq)} * wcc${i}) * vec2(${f5(w.dx)}, ${f5(w.dz)});\n`;
            if (w.gerst) {
                s += `wdisp += (${f5(w.gerst * w.amp)} * wcc${i}) * vec2(${f5(w.dx)}, ${f5(w.dz)});\n`;
            }
        }
        return s;
    }

    function makeRealisticWaterMaterial(opts) {
        opts = opts || {};
        const waveAmp = typeof opts.waveAmp === 'number' ? opts.waveAmp : 1.0;
        // Sea and ponds share the shader; each uses its own land.js wave table.
        const waves = opts.pond
            ? (typeof POND_WAVES !== 'undefined' ? POND_WAVES : null)
            : (typeof SEA_WAVES !== 'undefined' ? SEA_WAVES : null);
        const ripple = opts.pond ? 0.45 : 1.0;
        // 1x1 white placeholder until the real shore SDF is wired in build().
        const blankShore = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.LuminanceFormat);
        blankShore.needsUpdate = true;
        return new THREE.ShaderMaterial({
            fog: true,
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.fog,
                {
                    uTime: { value: 0 },
                    uSunDir: { value: new THREE.Vector3(180, 300, 105).normalize() },
                    uSunColor: { value: new THREE.Color(0xfff5e6) },
                    uSkyColor: { value: new THREE.Color(0x76a9d4) },
                    uDeepColor: { value: opts.deepColor || new THREE.Color(0x0d5063) },
                    uShallowColor: { value: opts.shallowColor || new THREE.Color(0x2bbfa9) },
                    uFoamColor: { value: new THREE.Color(0xf6feff) },
                    uWaveAmp: { value: waveAmp },
                    uRipple: { value: ripple },
                    uNightF: { value: 0 },
                    uShoreOn: { value: 0 },
                    uShoreTex: { value: blankShore },
                    uShoreMin: { value: new THREE.Vector2(0, 0) },
                    uShoreSize: { value: new THREE.Vector2(1, 1) },
                    uShoreMax: { value: 60 }
                }
            ]),
            vertexShader: `
                #include <common>
                #include <logdepthbuf_pars_vertex>
                #include <fog_pars_vertex>
                uniform float uTime;
                uniform float uWaveAmp;
                varying vec3 vWorldPos;
                varying vec3 vNormal;
                varying float vWaveHeight;

                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vec2 wp = worldPos.xz;
                    float wy = 0.0;
                    vec2 wgrad = vec2(0.0);
                    vec2 wdisp = vec2(0.0);
                    ${waves ? waveGLSL(waves) : 'wy = 0.0;'}
                    worldPos.xz += wdisp;
                    worldPos.y += wy * uWaveAmp;
                    vWaveHeight = wy * uWaveAmp;
                    vWorldPos = worldPos.xyz;

                    vec3 localNorm = normalize(vec3(-wgrad.x * uWaveAmp, 1.0, -wgrad.y * uWaveAmp));
                    vNormal = localNorm;

                    vec4 mvPosition = viewMatrix * worldPos;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <logdepthbuf_vertex>
                    #include <fog_vertex>
                }
            `,
            fragmentShader: `
                #include <common>
                #include <logdepthbuf_pars_fragment>
                #include <fog_pars_fragment>
                uniform float uTime;
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                uniform vec3 uSkyColor;
                uniform vec3 uDeepColor;
                uniform vec3 uShallowColor;
                uniform vec3 uFoamColor;
                uniform float uRipple;
                uniform float uNightF;
                uniform float uShoreOn;
                uniform sampler2D uShoreTex;
                uniform vec2 uShoreMin;
                uniform vec2 uShoreSize;
                uniform float uShoreMax;

                varying vec3 vWorldPos;
                varying vec3 vNormal;
                varying float vWaveHeight;

                void main() {
                    #include <logdepthbuf_fragment>
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);

                    // Two advected ripple octaves for close-up surface detail.
                    // Tuned dense + fine: tropical chop reads through glitter.
                    vec2 flow = vec2(uTime * 0.06, uTime * 0.045);
                    vec2 rp = vWorldPos.xz * 0.85 + flow * 8.0;
                    float d1 = sin(dot(rp, vec2(0.8, 0.6)) + uTime * 1.6);
                    float d2 = sin(dot(rp * 1.9 + 3.1, vec2(-0.5, 0.86)) - uTime * 2.1);
                    vec3 perturbedNorm = normalize(vNormal
                        + vec3(d1 * 0.060 + d2 * 0.036, 0.0, d2 * 0.060 - d1 * 0.036) * uRipple);

                    // Schlick fresnel (water F0 = 0.02): mirror at grazing angles.
                    float NdotV = clamp(dot(perturbedNorm, viewDir), 0.0, 1.0);
                    float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

                    // Sun glitter: dense sparkling path + broad lagoon sheen.
                    vec2 cellId = floor(vWorldPos.xz * 6.0);
                    float hash = fract(sin(dot(cellId, vec2(12.9898, 78.233)) + uTime * 2.0) * 43758.5453);
                    float sparkle = step(0.955, hash);
                    vec3 halfDir = normalize(uSunDir + viewDir);
                    float NdotH = clamp(dot(perturbedNorm, halfDir), 0.0, 1.0);
                    float glitter = pow(NdotH, 150.0) * 3.6 * (0.50 + 1.6 * sparkle);
                    float sheen = pow(NdotH, 36.0) * 0.50;
                    vec3 sunLight = uSunColor * (glitter + sheen);

                    // Body color: crest grading + shallow tint near the shore.
                    float depthGrade = clamp((vWaveHeight + 0.12) / 0.24, 0.0, 1.0);
                    vec3 waterColor = mix(uDeepColor, uShallowColor, depthGrade * 0.65 + 0.2);
                    float shoreD = uShoreMax;
                    if (uShoreOn > 0.5) {
                        vec2 suv = clamp((vWorldPos.xz - uShoreMin) / uShoreSize, vec2(0.0), vec2(1.0));
                        shoreD = texture2D(uShoreTex, suv).r * uShoreMax;
                        float shallow = 1.0 - smoothstep(0.0, 24.0, shoreD);
                        waterColor = mix(waterColor, uShallowColor, shallow * 0.65);
                    }
                    waterColor *= mix(1.0, 0.20, uNightF);

                    vec3 finalCol = mix(waterColor, uSkyColor, clamp(F * 1.45, 0.0, 1.0));
                    finalCol += sunLight * mix(1.0, 0.7, uNightF);

                    // Foam: breaking crests + animated lapping band at the shore.
                    float lap = sin(shoreD * 1.35 - uTime * 1.9) * 0.5
                              + sin(shoreD * 2.7 + uTime * 2.7 + vWorldPos.x * 0.12 + vWorldPos.z * 0.09) * 0.3;
                    float foamBand = (1.0 - smoothstep(0.0, 3.0 + lap * 1.0, shoreD)) * uShoreOn;
                    float foam = max(smoothstep(0.085, 0.155, vWaveHeight), clamp(foamBand, 0.0, 1.0));
                    finalCol = mix(finalCol, uFoamColor, foam * 0.85);

                    // Grazing angles read opaque/reflective, steep angles stay glassy.
                    float alpha = mix(0.70, 0.96, clamp(F * 1.5, 0.0, 1.0));
                    gl_FragColor = vec4(finalCol, alpha);
                    #include <fog_fragment>
                }
            `,
            transparent: true,
            side: THREE.DoubleSide
        });
    }

    /**
     * TexFactory.build() creates every shared texture + material ONCE.
     * Returns { tex, mat } where mat are the shared materials.
     */
    const TexFactory = {
        build() {
            const tex = {};
            const mat = {};
            // Facade textures + materials
            for (const key in FACADE_STYLES) {
                tex[key] = makeCanvasTexture(128, 256, FACADE_STYLES[key]);
                mat[key] = new THREE.MeshLambertMaterial({ map: tex[key], vertexColors: true, side: THREE.FrontSide });
            }
            mat.roof = new THREE.MeshLambertMaterial({ map: tex.roof, vertexColors: true, side: THREE.FrontSide });
            // Billboard atlas (unlit => it glows against the shaded world)
            tex.billboard = makeCanvasTexture(1024, 512, drawBillboardAtlas);
            tex.billboard.wrapS = tex.billboard.wrapT = THREE.ClampToEdgeWrapping;
            mat.billboard = new THREE.MeshBasicMaterial({ map: tex.billboard, vertexColors: true });
            // Flat vertex-colored materials
            mat.flat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
            mat.building = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 0.5, polygonOffsetUnits: 1.0 });
            mat.basic = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide });
            // Water (sea: full wave set + baked shore-foam field)
            mat.water = makeRealisticWaterMaterial({ waveAmp: 1.0 });
            try {
                const shore = getShoreTexture();
                const u = mat.water.uniforms;
                u.uShoreTex.value = shore.tex;
                u.uShoreMin.value.set(shore.x0, shore.z0);
                u.uShoreSize.value.set(shore.sx, shore.sz);
                u.uShoreMax.value = shore.maxD;
                u.uShoreOn.value = 1.0;
            } catch (e) { /* sea renders without shore foam */ }
            mat.parkWater = makeRealisticWaterMaterial({
                pond: true,
                deepColor: new THREE.Color(0x123a4a),
                shallowColor: new THREE.Color(0x1d5a6a)
            });
            // Land / park grounds
            mat.land = new THREE.MeshLambertMaterial({
                color: 0xaba598,
                polygonOffset: true,
                polygonOffsetFactor: 4.0,
                polygonOffsetUnits: 4.0
            });
            mat.park = new THREE.MeshLambertMaterial({
                color: 0x4e7a3c,
                polygonOffset: true,
                polygonOffsetFactor: 2.0,
                polygonOffsetUnits: 2.0
            });
            // Plain grey stone (no vertex colors) — spare for untextured meshes
            mat.stone = new THREE.MeshLambertMaterial({ color: 0x8a8a90 });
            // Sky dome
            tex.sky = makeCanvasTexture(4, 256, (ctx, w, h) => {
                const g = ctx.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0.0, '#4a86c8');
                g.addColorStop(0.45, '#87b4dc');
                g.addColorStop(0.72, '#c8dcE8');
                g.addColorStop(1.0, '#e8ddc4');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            });
            tex.sky.wrapS = tex.sky.wrapT = THREE.ClampToEdgeWrapping;
            mat.sky = new THREE.MeshBasicMaterial({
                map: tex.sky, side: THREE.BackSide, depthWrite: false, fog: false,
            });
            // Radial glow (loot halos, headlights)
            tex.glow = makeCanvasTexture(64, 64, (ctx, w, h) => {
                const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
                g.addColorStop(0, 'rgba(255,255,255,0.9)');
                g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            });
            mat.glow = new THREE.MeshBasicMaterial({
                map: tex.glow, transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, fog: false,
            });
            return { tex, mat };
        },
    };
