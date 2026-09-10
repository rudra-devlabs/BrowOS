'use strict';

/**
 * Deterministic layered synthesis for Brow City's gunshot, explosion, and vocal SFX.
 *
 * Generates 48 kHz / 24-bit stereo PCM masters, then uses the locally available
 * ffmpeg executable to encode the exact OGG and MP3 paths consumed by gta.js.
 * No third-party Node packages are required.
 *
 * Run from the repository root:
 *   node scripts/generate-gta-combat-audio.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SAMPLE_RATE = 48000;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'assets', 'audio', 'gta');
const PEAK = 0.84; // ~1.5 dBFS of sample headroom before lossy encoding.
const TAU = Math.PI * 2;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeStereo(seconds) {
    const length = Math.ceil(seconds * SAMPLE_RATE);
    return { left: new Float64Array(length), right: new Float64Array(length) };
}

function biquad(type, frequency, q = 0.707) {
    const w0 = TAU * frequency / SAMPLE_RATE;
    const c = Math.cos(w0);
    const s = Math.sin(w0);
    const alpha = s / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') {
        b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2;
    } else if (type === 'highpass') {
        b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2;
    } else if (type === 'bandpass') {
        b0 = alpha; b1 = 0; b2 = -alpha;
    } else {
        throw new Error(`Unsupported filter type: ${type}`);
    }
    const a0 = 1 + alpha;
    const a1 = -2 * c;
    const a2 = 1 - alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
        const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2
            - (a1 / a0) * y1 - (a2 / a0) * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}

function addMono(buffer, signal, gain = 1, pan = 0) {
    const leftGain = gain * Math.sqrt((1 - pan) * 0.5);
    const rightGain = gain * Math.sqrt((1 + pan) * 0.5);
    const n = Math.min(buffer.left.length, signal.length);
    for (let i = 0; i < n; i++) {
        buffer.left[i] += signal[i] * leftGain;
        buffer.right[i] += signal[i] * rightGain;
    }
}

function addDelay(buffer, signal, delaySeconds, gain, pan = 0, damping = 0) {
    const delay = Math.round(delaySeconds * SAMPLE_RATE);
    const leftGain = gain * Math.sqrt((1 - pan) * 0.5);
    const rightGain = gain * Math.sqrt((1 + pan) * 0.5);
    let smoothed = 0;
    for (let i = 0; i < signal.length && i + delay < buffer.left.length; i++) {
        smoothed += (signal[i] - smoothed) * (1 - damping);
        buffer.left[i + delay] += smoothed * leftGain;
        buffer.right[i + delay] += smoothed * rightGain;
    }
}

function noiseSignal(length, rng, envelope, filters = []) {
    const out = new Float64Array(length);
    for (let i = 0; i < length; i++) {
        let x = rng() * 2 - 1;
        for (const filter of filters) x = filter(x);
        out[i] = x * envelope(i / SAMPLE_RATE);
    }
    return out;
}

function chirp(length, startHz, endHz, envelope, phaseOffset = 0) {
    const out = new Float64Array(length);
    let phase = phaseOffset;
    for (let i = 0; i < length; i++) {
        const t = i / SAMPLE_RATE;
        const p = i / Math.max(1, length - 1);
        const hz = startHz * Math.pow(endHz / startHz, p);
        phase += TAU * hz / SAMPLE_RATE;
        out[i] = Math.sin(phase) * envelope(t);
    }
    return out;
}

function addCrackle(buffer, rng, start, end, count, gain) {
    for (let event = 0; event < count; event++) {
        const at = start + (end - start) * Math.pow(rng(), 1.35);
        const index = Math.floor(at * SAMPLE_RATE);
        const duration = 0.004 + rng() * 0.026;
        const samples = Math.floor(duration * SAMPLE_RATE);
        const hp = biquad('highpass', 900 + rng() * 2600, 0.65);
        const lp = biquad('lowpass', 4500 + rng() * 7500, 0.65);
        const pan = rng() * 1.6 - 0.8;
        const lg = Math.sqrt((1 - pan) * 0.5);
        const rg = Math.sqrt((1 + pan) * 0.5);
        const strength = gain * (0.35 + rng() * 0.65) * Math.exp(-at * 0.55);
        for (let i = 0; i < samples && index + i < buffer.left.length; i++) {
            let x = lp(hp(rng() * 2 - 1));
            x *= strength * Math.exp(-i / (SAMPLE_RATE * (duration * 0.2)));
            buffer.left[index + i] += x * lg;
            buffer.right[index + i] += x * rg;
        }
    }
}

function synthesizeGunshot() {
    const rng = mulberry32(0x47554E31);
    const buffer = makeStereo(0.9);
    const n = buffer.left.length;

    // Supersonic muzzle crack: bright, extremely short, but band-limited.
    const crack = noiseSignal(n, rng,
        t => (1 - Math.exp(-t / 0.00018)) * Math.exp(-t / 0.0085),
        [biquad('highpass', 900, 0.62), biquad('lowpass', 14500, 0.72)]);
    addMono(buffer, crack, 1.7, -0.03);

    // Propellant/body: broad low-mid punch plus a rapidly falling pressure chirp.
    const bodyNoise = noiseSignal(n, rng,
        t => (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / 0.052),
        [biquad('highpass', 90, 0.7), biquad('lowpass', 3600, 0.72)]);
    addMono(buffer, bodyNoise, 1.12, 0.02);
    addMono(buffer, chirp(n, 310, 92, t => (1 - Math.exp(-t / 0.001)) * Math.exp(-t / 0.071)), 0.88);
    addMono(buffer, chirp(n, 690, 180, t => Math.exp(-t / 0.029), 1.1), 0.28, 0.04);

    // Controlled nearby-space bloom.
    const tail = noiseSignal(n, rng,
        t => t < 0.015 ? 0 : Math.exp(-(t - 0.015) / 0.145),
        [biquad('highpass', 210, 0.58), biquad('lowpass', 5200, 0.64)]);
    addMono(buffer, tail, 0.31);

    // Slide/action sounds just after the muzzle event.
    const mechanism = new Float64Array(n);
    for (const click of [{ t: 0.038, a: 0.32 }, { t: 0.071, a: 0.19 }]) {
        const start = Math.floor(click.t * SAMPLE_RATE);
        const hp = biquad('highpass', 1700, 0.65);
        const lp = biquad('lowpass', 9800, 0.7);
        for (let i = 0; i < 0.012 * SAMPLE_RATE && start + i < n; i++) {
            mechanism[start + i] += lp(hp(rng() * 2 - 1)) * click.a * Math.exp(-i / 115);
        }
    }
    addMono(buffer, mechanism, 0.75, 0.18);

    // Sparse early reflections give the close shot a believable urban footprint.
    addDelay(buffer, crack, 0.021, 0.23, -0.45, 0.18);
    addDelay(buffer, bodyNoise, 0.039, 0.21, 0.38, 0.28);
    addDelay(buffer, crack, 0.064, 0.13, 0.62, 0.32);
    addDelay(buffer, bodyNoise, 0.103, 0.10, -0.57, 0.40);
    addDelay(buffer, tail, 0.151, 0.10, 0.25, 0.45);

    return buffer;
}

function synthesizeBoom() {
    const rng = mulberry32(0x424F4F4D);
    const buffer = makeStereo(4.2);
    const n = buffer.left.length;

    // Initial shock front: quick broadband blast with a finite rise time.
    const blast = noiseSignal(n, rng,
        t => (1 - Math.exp(-t / 0.00055)) * Math.exp(-t / 0.042),
        [biquad('highpass', 55, 0.65), biquad('lowpass', 12500, 0.68)]);
    addMono(buffer, blast, 1.55, -0.02);

    // Pressure wave and chest impact, with slight harmonic asymmetry.
    const pressure = chirp(n, 118, 31, t => (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.83));
    const sub = chirp(n, 62, 25, t => (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 1.42), 0.6);
    addMono(buffer, pressure, 1.1);
    addMono(buffer, sub, 0.92, 0.01);

    // Dense, layered rumble avoids a single synthetic-sounding low tone.
    const rumbleA = noiseSignal(n, rng,
        t => (1 - Math.exp(-t / 0.018)) * Math.exp(-t / 1.16),
        [biquad('highpass', 24, 0.65), biquad('lowpass', 310, 0.72)]);
    const rumbleB = noiseSignal(n, rng,
        t => t < 0.055 ? 0 : (1 - Math.exp(-(t - 0.055) / 0.035)) * Math.exp(-(t - 0.055) / 1.75),
        [biquad('bandpass', 155, 0.48), biquad('lowpass', 720, 0.68)]);
    addMono(buffer, rumbleA, 1.08, -0.09);
    addMono(buffer, rumbleB, 0.78, 0.13);

    // Hot gas/noisy debris wash.
    const debrisWash = noiseSignal(n, rng,
        t => (1 - Math.exp(-t / 0.006)) * Math.exp(-t / 0.39),
        [biquad('highpass', 420, 0.6), biquad('lowpass', 7200, 0.65)]);
    addMono(buffer, debrisWash, 0.58, 0.04);
    addCrackle(buffer, rng, 0.018, 1.55, 86, 0.55);

    // Long environmental decay made from decorrelated, damped reflections.
    const tail = noiseSignal(n, rng,
        t => t < 0.09 ? 0 : (1 - Math.exp(-(t - 0.09) / 0.06)) * Math.exp(-(t - 0.09) / 1.22),
        [biquad('highpass', 75, 0.62), biquad('lowpass', 3300, 0.62)]);
    addMono(buffer, tail, 0.37);
    addDelay(buffer, blast, 0.083, 0.25, -0.58, 0.34);
    addDelay(buffer, blast, 0.137, 0.19, 0.53, 0.42);
    addDelay(buffer, rumbleA, 0.224, 0.22, 0.35, 0.30);
    addDelay(buffer, debrisWash, 0.316, 0.15, -0.44, 0.48);
    addDelay(buffer, tail, 0.481, 0.20, 0.62, 0.52);
    addDelay(buffer, tail, 0.733, 0.14, -0.67, 0.58);

    return buffer;
}

function synthesizeScream() {
    const rng = mulberry32(0x5343524D);
    const buffer = makeStereo(1.18);
    const n = buffer.left.length;
    const voice = new Float64Array(n);
    const breath = new Float64Array(n);

    // Two parallel vowel shapes crossfade as the jaw opens, then relaxes.
    const openFormants = [
        biquad('bandpass', 780, 5.4),
        biquad('bandpass', 1260, 7.2),
        biquad('bandpass', 2680, 8.5),
        biquad('bandpass', 3550, 7.0),
    ];
    const tightFormants = [
        biquad('bandpass', 540, 5.8),
        biquad('bandpass', 1720, 7.8),
        biquad('bandpass', 2860, 8.8),
        biquad('bandpass', 3900, 7.4),
    ];
    const breathBand = biquad('bandpass', 2350, 0.72);
    const breathHigh = biquad('highpass', 620, 0.65);
    const raspBand = biquad('bandpass', 1650, 1.3);

    let phase = 0;
    let jitter = 0;
    let previousPulse = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const p = i / Math.max(1, n - 1);
        const attack = 1 - Math.exp(-t / 0.012);
        const release = p < 0.58 ? 1 : Math.pow(Math.max(0, (1 - p) / 0.42), 1.45);
        const urgency = 0.82 + 0.18 * Math.exp(-Math.pow((p - 0.20) / 0.18, 2));
        const envelope = attack * release * urgency;

        // Adult distressed contour: a fast upward catch, sustained tension, then falloff.
        let baseHz;
        if (p < 0.10) baseHz = 178 + 720 * p;
        else if (p < 0.58) baseHz = 250 - 54 * ((p - 0.10) / 0.48);
        else baseHz = 196 - 62 * ((p - 0.58) / 0.42);
        jitter += ((rng() * 2 - 1) - jitter) * 0.018;
        const vibrato = 1 + 0.022 * Math.sin(TAU * 5.7 * t + 0.4)
            + 0.007 * Math.sin(TAU * 11.9 * t) + jitter * 0.012;
        phase += TAU * baseHz * vibrato / SAMPLE_RATE;

        // A tilted harmonic glottal source remains clearly voiced without becoming a pure tone.
        let pulse = 0;
        for (let harmonic = 1; harmonic <= 12; harmonic++) {
            const tilt = 1 / Math.pow(harmonic, 1.18);
            pulse += Math.sin(phase * harmonic + harmonic * 0.045) * tilt;
        }
        pulse *= 0.58;
        const aspiration = rng() * 2 - 1;
        const rasp = raspBand((pulse - previousPulse) * (0.45 + 0.35 * Math.sin(phase * 0.5)));
        previousPulse = pulse;

        const jaw = Math.max(0, Math.min(1,
            p < 0.28 ? p / 0.28 : 1 - 0.48 * ((p - 0.28) / 0.72)));
        let open = 0;
        let tight = 0;
        for (let band = 0; band < openFormants.length; band++) {
            const bandGain = [1.0, 0.72, 0.42, 0.20][band];
            open += openFormants[band](pulse) * bandGain;
            tight += tightFormants[band](pulse) * bandGain;
        }
        voice[i] = ((open * jaw + tight * (1 - jaw)) * 1.7 + rasp * 0.16) * envelope;

        // Breath rises around the urgent onset and becomes more audible through the decay.
        const breathAmount = (0.13 + 0.15 * (1 - release) + 0.10 * Math.exp(-t / 0.10));
        breath[i] = breathBand(breathHigh(aspiration)) * breathAmount * attack * Math.sqrt(release);
    }

    addMono(buffer, voice, 0.92, -0.015);
    addMono(buffer, breath, 0.72, 0.02);
    // Very short, damped reflections add body without making repeated NPC playback muddy.
    addDelay(buffer, voice, 0.019, 0.075, -0.18, 0.34);
    addDelay(buffer, voice, 0.034, 0.052, 0.21, 0.46);
    addDelay(buffer, breath, 0.047, 0.038, -0.12, 0.55);

    return buffer;
}

function master(buffer) {
    const n = buffer.left.length;
    // Remove DC, apply a gentle safety saturator, and fade the final 80 ms.
    for (const channel of [buffer.left, buffer.right]) {
        let previousInput = 0;
        let previousOutput = 0;
        for (let i = 0; i < n; i++) {
            const dcBlocked = channel[i] - previousInput + 0.995 * previousOutput;
            previousInput = channel[i];
            previousOutput = dcBlocked;
            channel[i] = Math.tanh(dcBlocked * 0.78);
        }
        const fadeSamples = Math.min(n, Math.round(0.08 * SAMPLE_RATE));
        for (let i = 0; i < fadeSamples; i++) {
            channel[n - fadeSamples + i] *= Math.cos((i / fadeSamples) * Math.PI * 0.5);
        }
    }

    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buffer.left[i]), Math.abs(buffer.right[i]));
    const scale = peak > 0 ? PEAK / peak : 1;
    for (let i = 0; i < n; i++) {
        buffer.left[i] *= scale;
        buffer.right[i] *= scale;
    }
}

function writeWav24(filePath, buffer) {
    const frames = buffer.left.length;
    const channels = 2;
    const bytesPerSample = 3;
    const dataSize = frames * channels * bytesPerSample;
    const wav = Buffer.allocUnsafe(44 + dataSize);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(SAMPLE_RATE, 24);
    wav.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
    wav.writeUInt16LE(channels * bytesPerSample, 32);
    wav.writeUInt16LE(24, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < frames; i++) {
        for (const sample of [buffer.left[i], buffer.right[i]]) {
            let value = Math.round(Math.max(-1, Math.min(1, sample)) * 8388607);
            if (value < 0) value += 0x1000000;
            wav[offset++] = value & 0xff;
            wav[offset++] = (value >>> 8) & 0xff;
            wav[offset++] = (value >>> 16) & 0xff;
        }
    }
    fs.writeFileSync(filePath, wav);
}

function encode(masterPath, destination, codecArgs) {
    const result = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', masterPath,
        '-map_metadata', '-1', ...codecArgs, destination,
    ], { stdio: 'inherit' });
    if (result.error) throw new Error(`Unable to run local ffmpeg: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}`);
}

function generate(name, synthesize) {
    const wavPath = path.join(OUTPUT_DIR, `.${name}.master.wav`);
    const oggPath = path.join(OUTPUT_DIR, `${name}.ogg`);
    const mp3Path = path.join(OUTPUT_DIR, `${name}.mp3`);
    const buffer = synthesize();
    master(buffer);
    writeWav24(wavPath, buffer);
    try {
        encode(wavPath, oggPath, ['-c:a', 'libvorbis', '-q:a', '7']);
        encode(wavPath, mp3Path, ['-c:a', 'libmp3lame', '-b:a', '192k']);
    } finally {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    }
    console.log(`Generated ${path.relative(process.cwd(), oggPath)} and ${path.relative(process.cwd(), mp3Path)}`);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const generators = {
    gunshot: synthesizeGunshot,
    boom: synthesizeBoom,
    scream: synthesizeScream,
};
const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : Object.keys(generators);
for (const name of targets) {
    if (!generators[name]) throw new Error(`Unknown sound: ${name}`);
    generate(name, generators[name]);
}
