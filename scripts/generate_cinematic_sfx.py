"""
Generate Studio-Grade Cinematic SFX for Brow City GTA.
Uses numpy, scipy.signal, and ffmpeg to synthesize 48kHz stereo audio assets.
Replaces low-fidelity noise bursts with rich, layered, punchy game audio:
- gunshot, boom, crash, engine_idle, engine_loop, siren_loop, horn, skid,
  punch, pickup_cash, pickup_item, footstep, scream, spray, splash, bust.
"""

import os
import sys
import subprocess
import numpy as np
from scipy import signal

SAMPLE_RATE = 48000
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'gta'))
os.makedirs(OUTPUT_DIR, exist_ok=True)

def normalize_and_master(stereo, peak_db=-1.0):
    """Normalize stereo signal (2, N) to peak_db with soft-limiting tanh saturation."""
    left = stereo[0]
    right = stereo[1]
    
    # DC block filter
    b, a = signal.butter(2, 20.0 / (SAMPLE_RATE / 2.0), btype='highpass')
    left = signal.lfilter(b, a, left)
    right = signal.lfilter(b, a, right)
    
    # Soft saturation
    left = np.tanh(left * 0.9)
    right = np.tanh(right * 0.9)
    
    # Peak normalization
    max_val = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-6)
    target = 10.0 ** (peak_db / 20.0)
    scale = target / max_val
    left = np.clip(left * scale, -0.99, 0.99)
    right = np.clip(right * scale, -0.99, 0.99)
    
    return np.ascontiguousarray(np.vstack((left, right)), dtype=np.float32)

def save_and_encode(name, stereo_master):
    """Write temporary WAV and encode to OGG and MP3 using ffmpeg."""
    wav_temp = os.path.join(OUTPUT_DIR, f".temp_{name}.wav")
    ogg_path = os.path.join(OUTPUT_DIR, f"{name}.ogg")
    mp3_path = os.path.join(OUTPUT_DIR, f"{name}.mp3")
    
    # Write 24-bit PCM WAV
    channels, frames = stereo_master.shape
    pcm_data = (stereo_master.T * 8388607.0).astype(np.int32)
    # Pack 24-bit LE
    b0 = (pcm_data & 0xFF).astype(np.uint8)
    b1 = ((pcm_data >> 8) & 0xFF).astype(np.uint8)
    b2 = ((pcm_data >> 16) & 0xFF).astype(np.uint8)
    packed = np.empty((frames, channels, 3), dtype=np.uint8)
    packed[:, :, 0] = b0
    packed[:, :, 1] = b1
    packed[:, :, 2] = b2
    raw_bytes = packed.tobytes()
    
    # Build WAV header
    data_size = len(raw_bytes)
    riff_header = bytearray()
    riff_header.extend(b'RIFF')
    riff_header.extend((36 + data_size).to_bytes(4, 'little'))
    riff_header.extend(b'WAVE')
    riff_header.extend(b'fmt ')
    riff_header.extend((16).to_bytes(4, 'little'))  # Subchunk1Size
    riff_header.extend((1).to_bytes(2, 'little'))   # PCM
    riff_header.extend((channels).to_bytes(2, 'little'))
    riff_header.extend((SAMPLE_RATE).to_bytes(4, 'little'))
    byte_rate = SAMPLE_RATE * channels * 3
    riff_header.extend((byte_rate).to_bytes(4, 'little'))
    riff_header.extend((channels * 3).to_bytes(2, 'little')) # BlockAlign
    riff_header.extend((24).to_bytes(2, 'little'))  # BitsPerSample
    riff_header.extend(b'data')
    riff_header.extend((data_size).to_bytes(4, 'little'))
    
    with open(wav_temp, 'wb') as f:
        f.write(riff_header)
        f.write(raw_bytes)
        
    try:
        # Encode OGG
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-i', wav_temp, '-c:a', 'libvorbis', '-q:a', '7', ogg_path
        ], check=True)
        # Encode MP3
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-i', wav_temp, '-c:a', 'libmp3lame', '-b:a', '192k', mp3_path
        ], check=True)
        print(f"  [+] Encoded {name}.ogg & {name}.mp3 ({frames/SAMPLE_RATE:.2f}s)")
    finally:
        if os.path.exists(wav_temp):
            os.remove(wav_temp)

def make_reverb_taps(signal_mono, taps):
    """Simulate early reflections and diffuse stereo delay taps: [(delay_ms, gain_l, gain_r, damping_freq)]"""
    n = len(signal_mono)
    max_delay = int(max(t[0] for t in taps) * SAMPLE_RATE / 1000.0) + n
    out_l = np.zeros(max_delay)
    out_r = np.zeros(max_delay)
    out_l[:n] += signal_mono * 0.7
    out_r[:n] += signal_mono * 0.7
    
    for delay_ms, gl, gr, damp in taps:
        d_samples = int(delay_ms * SAMPLE_RATE / 1000.0)
        nyq = SAMPLE_RATE / 2.0
        b, a = signal.butter(1, min(0.95, damp / nyq), btype='lowpass')
        damped = signal.lfilter(b, a, signal_mono)
        end = d_samples + n
        out_l[d_samples:end] += damped * gl
        out_r[d_samples:end] += damped * gr
        
    return out_l, out_r

# ============================================================================
# SFX SYNTHESIZERS
# ============================================================================

def synth_gunshot():
    """Heavy 9mm / tactical handgun with explosive muzzle punch, slide recoil click, and urban alley echo."""
    dur = 0.85
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    # 1. Supersonic crack transient (0 - 8ms)
    noise = np.random.uniform(-1, 1, N)
    b_crack, a_crack = signal.butter(2, [1200 / (SAMPLE_RATE/2), 16000 / (SAMPLE_RATE/2)], btype='bandpass')
    crack_noise = signal.lfilter(b_crack, a_crack, noise)
    crack_env = np.exp(-t / 0.006) * (1.0 - np.exp(-t / 0.0002))
    crack = crack_noise * crack_env * 2.8
    
    # 2. Sub-bass barrel punch (45Hz - 160Hz drop)
    sub_pitch = 160.0 * np.exp(-t / 0.035) + 38.0
    sub_phase = 2 * np.pi * np.cumsum(sub_pitch) / SAMPLE_RATE
    sub_env = np.exp(-t / 0.065) * (1.0 - np.exp(-t / 0.001))
    sub = np.sin(sub_phase) * sub_env * 2.2
    
    # 3. Mid-range propellant body blast
    b_body, a_body = signal.butter(2, [80 / (SAMPLE_RATE/2), 3500 / (SAMPLE_RATE/2)], btype='bandpass')
    body_noise = signal.lfilter(b_body, a_body, noise)
    body_env = np.exp(-t / 0.045) * (1.0 - np.exp(-t / 0.0015))
    body = body_noise * body_env * 1.6
    
    # 4. Metallic slide rack & hammer click (at 32ms and 68ms)
    mech = np.zeros(N)
    for click_t, gain in [(0.032, 0.4), (0.068, 0.28)]:
        idx = int(click_t * SAMPLE_RATE)
        c_len = int(0.012 * SAMPLE_RATE)
        if idx + c_len < N:
            c_noise = np.random.uniform(-1, 1, c_len)
            b_c, a_c = signal.butter(2, [2200 / (SAMPLE_RATE/2), 9500 / (SAMPLE_RATE/2)], btype='bandpass')
            c_filt = signal.lfilter(b_c, a_c, c_noise)
            c_env = np.exp(-np.linspace(0, 1, c_len) * 7.0)
            mech[idx:idx+c_len] += c_filt * c_env * gain
            
    dry = crack + sub + body + mech
    
    taps = [
        (18, 0.32, 0.18, 5500),
        (38, 0.16, 0.28, 4200),
        (72, 0.24, 0.14, 3000),
        (125, 0.12, 0.20, 2200),
        (190, 0.15, 0.11, 1600),
        (280, 0.08, 0.12, 1100),
    ]
    out_l, out_r = make_reverb_taps(dry, taps)
    out_l = out_l[:N]
    out_r = out_r[:N]
    
    fade = np.minimum(1.0, np.linspace(1.0, 0.0, N)**0.7)
    return normalize_and_master(np.vstack((out_l * fade, out_r * fade)), peak_db=-0.8)

def synth_boom():
    """Massive high-yield explosion with seismic sub-bass, hot gas expansion, debris crackle, and long urban rumble."""
    dur = 3.6
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    # 1. Immediate pressure shockwave
    noise = np.random.uniform(-1, 1, N)
    b_shock, a_shock = signal.butter(2, [40 / (SAMPLE_RATE/2), 8000 / (SAMPLE_RATE/2)], btype='bandpass')
    shock = signal.lfilter(b_shock, a_shock, noise) * np.exp(-t / 0.05) * (1.0 - np.exp(-t / 0.0008)) * 2.5
    
    # 2. Heavy seismic sub-bass sweep (85Hz down to 26Hz)
    sub_pitch = 85.0 * np.exp(-t / 0.5) + 26.0
    sub_phase = 2 * np.pi * np.cumsum(sub_pitch) / SAMPLE_RATE
    sub_env = np.exp(-t / 1.1) * (1.0 - np.exp(-t / 0.015))
    sub = (np.sin(sub_phase) + 0.35 * np.sin(sub_phase * 2)) * sub_env * 2.4
    
    # 3. Dense low-end fire rumble
    b_rumble, a_rumble = signal.butter(3, 240 / (SAMPLE_RATE/2), btype='lowpass')
    rumble = signal.lfilter(b_rumble, a_rumble, noise) * np.exp(-t / 1.4) * (1.0 - np.exp(-t / 0.03)) * 2.0
    
    # 4. Debris crackles and fragmentation
    crackle = np.zeros(N)
    rng = np.random.RandomState(4242)
    for _ in range(75):
        pos = int(rng.uniform(0.04, 1.8) * SAMPLE_RATE)
        c_dur = int(rng.uniform(0.005, 0.025) * SAMPLE_RATE)
        if pos + c_dur < N:
            c_sig = rng.uniform(-1, 1, c_dur) * np.exp(-np.linspace(0, 1, c_dur) * 6.0)
            b_c, a_c = signal.butter(2, [600 / (SAMPLE_RATE/2), 6500 / (SAMPLE_RATE/2)], btype='bandpass')
            c_sig = signal.lfilter(b_c, a_c, c_sig)
            crackle[pos:pos+c_dur] += c_sig * rng.uniform(0.15, 0.5)
            
    dry = shock + sub + rumble + crackle
    
    taps = [
        (45, 0.35, 0.22, 3800),
        (95, 0.20, 0.34, 2600),
        (180, 0.26, 0.18, 1800),
        (310, 0.16, 0.22, 1200),
        (520, 0.18, 0.14, 850),
        (850, 0.12, 0.15, 600),
        (1350, 0.08, 0.09, 400),
    ]
    out_l, out_r = make_reverb_taps(dry, taps)
    out_l = out_l[:N]
    out_r = out_r[:N]
    
    fade = np.minimum(1.0, (1.0 - t / dur)**1.2)
    return normalize_and_master(np.vstack((out_l * fade, out_r * fade)), peak_db=-0.8)

def synth_crash():
    """Severe vehicular collision: heavy structural chassis impact, crumpled sheet metal resonance, and scattering shattered glass."""
    dur = 1.1
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    # 1. Structural chassis thump (65Hz - 140Hz)
    chassis_pitch = 140.0 * np.exp(-t / 0.05) + 48.0
    chassis_phase = 2 * np.pi * np.cumsum(chassis_pitch) / SAMPLE_RATE
    chassis = np.sin(chassis_phase) * np.exp(-t / 0.09) * 2.2
    
    # 2. Crumpled sheet metal (resonant multi-peaked metallic distortion)
    noise = np.random.uniform(-1, 1, N)
    metal = np.zeros(N)
    for freq, q_val, g in [(340, 4.0, 0.8), (560, 5.0, 0.7), (880, 6.0, 0.6), (1350, 5.0, 0.45)]:
        b, a = signal.iirpeak(freq / (SAMPLE_RATE/2), q_val)
        metal += signal.lfilter(b, a, noise) * g
    metal *= np.exp(-t / 0.16) * (1.0 - np.exp(-t / 0.002)) * 1.8
    
    # 3. High-frequency glass shatter and tinkling scatter
    b_glass, a_glass = signal.butter(3, 4200 / (SAMPLE_RATE/2), btype='highpass')
    glass_burst = signal.lfilter(b_glass, a_glass, noise) * np.exp(-t / 0.42) * (1.0 - np.exp(-t / 0.008)) * 1.4
    
    rng = np.random.RandomState(999)
    glass_tinkle = np.zeros(N)
    for _ in range(40):
        pos = int(rng.uniform(0.03, 0.75) * SAMPLE_RATE)
        sh_dur = int(rng.uniform(0.004, 0.02) * SAMPLE_RATE)
        if pos + sh_dur < N:
            f = rng.uniform(5000, 14000)
            sh_t = np.linspace(0, sh_dur / SAMPLE_RATE, sh_dur, endpoint=False)
            tone = np.sin(2 * np.pi * f * sh_t) * np.exp(-sh_t / 0.004) * rng.uniform(0.1, 0.4)
            glass_tinkle[pos:pos+sh_dur] += tone
            
    dry = chassis + metal + glass_burst + glass_tinkle
    
    taps = [
        (12, 0.4, 0.2, 7000),
        (35, 0.15, 0.35, 4500),
        (75, 0.25, 0.15, 3000),
        (140, 0.12, 0.20, 1800),
    ]
    out_l, out_r = make_reverb_taps(dry, taps)
    out_l = out_l[:N]
    out_r = out_r[:N]
    
    fade = np.minimum(1.0, (1.0 - t / dur)**1.1)
    return normalize_and_master(np.vstack((out_l * fade, out_r * fade)), peak_db=-0.8)

def synth_engine_idle():
    """Throaty, rumbling V8 engine idle (680 RPM crossplane crankshaft pulse, exhaust chamber throb). Seamless loop."""
    dur = 2.0
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    base_freq = 45.33
    
    signal_idle = np.zeros(N)
    for harmonic, amp in [(1, 1.0), (2, 0.75), (3, 0.45), (4, 0.35), (6, 0.18), (8, 0.12)]:
        signal_idle += np.sin(2 * np.pi * (base_freq * harmonic) * t) * amp
        
    sub_muffler = np.sin(2 * np.pi * 38.0 * t) * 0.55 + np.sin(2 * np.pi * 76.0 * t + 0.4) * 0.4
    
    noise = np.random.uniform(-1, 1, N)
    b_ex, a_ex = signal.butter(2, [30 / (SAMPLE_RATE/2), 180 / (SAMPLE_RATE/2)], btype='bandpass')
    ex_noise = signal.lfilter(b_ex, a_ex, noise) * 0.45
    
    b_valv, a_valv = signal.butter(2, [2400 / (SAMPLE_RATE/2), 4800 / (SAMPLE_RATE/2)], btype='bandpass')
    valv_noise = signal.lfilter(b_valv, a_valv, noise) * 0.06
    
    idle_mono = signal_idle * 0.5 + sub_muffler + ex_noise + valv_noise
    idle_mono = np.tanh(idle_mono * 1.3)
    
    fade_len = int(0.15 * SAMPLE_RATE)
    fade_in = np.sin(np.linspace(0, np.pi/2, fade_len))**2
    fade_out = np.cos(np.linspace(0, np.pi/2, fade_len))**2
    
    head = idle_mono[:fade_len]
    tail = idle_mono[-fade_len:]
    idle_mono[:fade_len] = head * fade_in + tail * fade_out
    idle_mono[-fade_len:] = head * fade_in + tail * fade_out
    
    l_chan = idle_mono
    r_chan = np.roll(idle_mono, int(SAMPLE_RATE * 0.002)) * 0.95 + idle_mono * 0.05
    return normalize_and_master(np.vstack((l_chan, r_chan)), peak_db=-1.2)

def synth_engine_loop():
    """Roaring V8 high-RPM acceleration / cruising loop (~3400 RPM). Deep exhaust roar, intake growl. Seamless loop."""
    dur = 2.0
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    fund = 226.66
    
    engine = np.zeros(N)
    for h, amp in [(0.5, 0.65), (1, 1.0), (1.5, 0.4), (2, 0.85), (3, 0.55), (4, 0.4), (5, 0.25), (6, 0.18)]:
        engine += np.sin(2 * np.pi * (fund * h) * t) * amp
        
    noise = np.random.uniform(-1, 1, N)
    b_intake, a_intake = signal.butter(2, [280 / (SAMPLE_RATE/2), 950 / (SAMPLE_RATE/2)], btype='bandpass')
    intake = signal.lfilter(b_intake, a_intake, noise) * 0.75
    
    b_buff, a_buff = signal.butter(2, [55 / (SAMPLE_RATE/2), 380 / (SAMPLE_RATE/2)], btype='bandpass')
    buff = signal.lfilter(b_buff, a_buff, noise) * 0.6
    
    total = np.tanh((engine * 0.45 + intake + buff) * 1.4)
    
    fade_len = int(0.15 * SAMPLE_RATE)
    fade_in = np.sin(np.linspace(0, np.pi/2, fade_len))**2
    fade_out = np.cos(np.linspace(0, np.pi/2, fade_len))**2
    
    head = total[:fade_len]
    tail = total[-fade_len:]
    total[:fade_len] = head * fade_in + tail * fade_out
    total[-fade_len:] = head * fade_in + tail * fade_out
    
    l_chan = total
    r_chan = np.roll(total, int(SAMPLE_RATE * 0.003)) * 0.9 + total * 0.1
    return normalize_and_master(np.vstack((l_chan, r_chan)), peak_db=-1.0)

def synth_siren_loop():
    """Authentic American police cruiser electronic 'Wail' siren (680Hz to 1320Hz sweep with horn resonance). Seamless 4.0s loop."""
    dur = 4.0
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    mod = 0.5 * (1.0 - np.cos(2 * np.pi * t / dur))
    freq = 680.0 + mod * 640.0
    phase = 2 * np.pi * np.cumsum(freq) / SAMPLE_RATE
    
    driver = (np.sin(phase) + 0.45 * np.sin(phase * 2) + 0.25 * np.sin(phase * 3) + 0.15 * np.sin(phase * 4))
    
    b_horn, a_horn = signal.iirpeak(1100 / (SAMPLE_RATE/2), 3.0)
    horn_boost = signal.lfilter(b_horn, a_horn, driver)
    
    siren_mono = np.tanh(driver * 0.7 + horn_boost * 0.5)
    
    delay_samples = int(0.006 * SAMPLE_RATE)
    out_l = siren_mono
    out_r = np.roll(siren_mono, delay_samples)
    return normalize_and_master(np.vstack((out_l, out_r)), peak_db=-1.2)

def synth_horn():
    """Dual-tone resonant Detroit car horn (F#4 370Hz + A#4 466Hz chord with brass acoustic bell)."""
    dur = 0.65
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    f1, f2 = 370.0, 466.0
    tone1 = np.sin(2 * np.pi * f1 * t) + 0.4 * np.sin(2 * np.pi * f1 * 2 * t) + 0.2 * np.sin(2 * np.pi * (f1 + 1.5) * t)
    tone2 = np.sin(2 * np.pi * f2 * t) + 0.4 * np.sin(2 * np.pi * f2 * 2 * t) + 0.2 * np.sin(2 * np.pi * (f2 - 1.2) * t)
    
    env = np.ones(N)
    attack = int(0.02 * SAMPLE_RATE)
    release = int(0.09 * SAMPLE_RATE)
    env[:attack] = np.sin(np.linspace(0, np.pi/2, attack))
    env[-release:] = np.cos(np.linspace(0, np.pi/2, release))**1.5
    
    horn_mono = np.tanh((tone1 + tone2) * env * 0.8)
    
    taps = [(18, 0.25, 0.15, 3500), (45, 0.15, 0.22, 2200)]
    out_l, out_r = make_reverb_taps(horn_mono, taps)
    return normalize_and_master(np.vstack((out_l[:N], out_r[:N])), peak_db=-1.0)

def synth_skid():
    """High-friction tire screech and gravel/asphalt slide."""
    dur = 0.85
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    screech_freq = 950.0 + 350.0 * np.sin(2 * np.pi * 14.0 * t) + 180.0 * np.random.uniform(-1, 1, N)
    screech_phase = 2 * np.pi * np.cumsum(screech_freq) / SAMPLE_RATE
    screech = np.sin(screech_phase) * 0.65
    
    noise = np.random.uniform(-1, 1, N)
    b_fric, a_fric = signal.butter(2, [700 / (SAMPLE_RATE/2), 4200 / (SAMPLE_RATE/2)], btype='bandpass')
    friction = signal.lfilter(b_fric, a_fric, noise) * 0.85
    
    env = np.sin(np.linspace(0, np.pi, N))**0.7
    skid_mono = np.tanh((screech + friction) * env * 1.2)
    
    l = skid_mono
    r = np.roll(skid_mono, int(SAMPLE_RATE * 0.004))
    return normalize_and_master(np.vstack((l, r)), peak_db=-1.0)

def synth_punch():
    """Heavy melee hit: crisp knuckles-on-jaw impact transient, visceral flesh/bone thud, rapid decay."""
    dur = 0.32
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    noise = np.random.uniform(-1, 1, N)
    b_crack, a_crack = signal.butter(2, [1400 / (SAMPLE_RATE/2), 6500 / (SAMPLE_RATE/2)], btype='bandpass')
    crack = signal.lfilter(b_crack, a_crack, noise) * np.exp(-t / 0.012) * 2.2
    
    sub_pitch = 125.0 * np.exp(-t / 0.025) + 40.0
    sub_phase = 2 * np.pi * np.cumsum(sub_pitch) / SAMPLE_RATE
    thump = np.sin(sub_phase) * np.exp(-t / 0.055) * 2.5
    
    b_tissue, a_tissue = signal.butter(2, 350 / (SAMPLE_RATE/2), btype='lowpass')
    tissue = signal.lfilter(b_tissue, a_tissue, noise) * np.exp(-t / 0.08) * 1.2
    
    dry = crack + thump + tissue
    out_l, out_r = dry * 0.95, dry * 0.95
    return normalize_and_master(np.vstack((out_l, out_r)), peak_db=-0.8)

def synth_pickup_cash():
    """Crisp cash register ring & coin chime: sparkling C7 (2093Hz) and G7 (3136Hz) metallic bell chime."""
    dur = 0.4
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    c7 = np.sin(2 * np.pi * 2093.0 * t) * np.exp(-t / 0.12)
    g7 = np.sin(2 * np.pi * 3136.0 * t) * np.exp(-t / 0.09) * 0.7
    c8 = np.sin(2 * np.pi * 4186.0 * t) * np.exp(-t / 0.05) * 0.4
    
    noise = np.random.uniform(-1, 1, N)
    b_clink, a_clink = signal.butter(2, 4500 / (SAMPLE_RATE/2), btype='highpass')
    clink = signal.lfilter(b_clink, a_clink, noise) * np.exp(-t / 0.015) * 0.5
    
    chime = (c7 + g7 + c8 + clink)
    out_l = chime * 0.9
    out_r = np.roll(chime, int(0.003 * SAMPLE_RATE)) * 0.9
    return normalize_and_master(np.vstack((out_l, out_r)), peak_db=-1.2)

def synth_pickup_item():
    """Tactical equipment grab: mechanical click + pleasant clean chime."""
    dur = 0.3
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    noise = np.random.uniform(-1, 1, N)
    b_click, a_click = signal.butter(2, [1800 / (SAMPLE_RATE/2), 8000 / (SAMPLE_RATE/2)], btype='bandpass')
    click = signal.lfilter(b_click, a_click, noise) * np.exp(-t / 0.018) * 1.5
    
    t1 = np.sin(2 * np.pi * 1046.5 * t) * np.exp(-t / 0.14) * 0.8
    t2_env = np.maximum(0, (t - 0.04))
    t2 = np.sin(2 * np.pi * 1567.98 * t2_env) * np.exp(-t2_env / 0.12) * (t > 0.04) * 0.8
    
    item = click + t1 + t2
    return normalize_and_master(np.vstack((item, item)), peak_db=-1.2)

def synth_footstep():
    """Solid shoe sole impact on concrete sidewalk: heel-strike transient + pavement resonance."""
    dur = 0.18
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    noise = np.random.uniform(-1, 1, N)
    b_scuff, a_scuff = signal.butter(2, [600 / (SAMPLE_RATE/2), 3200 / (SAMPLE_RATE/2)], btype='bandpass')
    scuff = signal.lfilter(b_scuff, a_scuff, noise) * np.exp(-t / 0.02) * 1.6
    
    pavement = np.sin(2 * np.pi * 140.0 * np.exp(-t / 0.015) * t) * np.exp(-t / 0.035) * 1.8
    
    step = scuff + pavement
    return normalize_and_master(np.vstack((step, step)), peak_db=-1.5)

def synth_scream():
    """Pedestrian panic scream: realistic formant-filtered vocal cords with urgency contour."""
    dur = 1.1
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    p = t / dur
    pitch = np.where(p < 0.15, 260.0 + 1500.0 * p, 485.0 - 180.0 * ((p - 0.15) / 0.85))
    pitch += 12.0 * np.sin(2 * np.pi * 7.5 * t)
    phase = 2 * np.pi * np.cumsum(pitch) / SAMPLE_RATE
    
    glottal = np.zeros(N)
    for h in range(1, 10):
        glottal += np.sin(phase * h) / (h ** 1.1)
        
    f1, f2, f3 = 850.0, 1450.0, 2900.0
    b1, a1 = signal.iirpeak(f1 / (SAMPLE_RATE/2), 5.0)
    b2, a2 = signal.iirpeak(f2 / (SAMPLE_RATE/2), 6.0)
    b3, a3 = signal.iirpeak(f3 / (SAMPLE_RATE/2), 5.0)
    
    vocal = signal.lfilter(b1, a1, glottal) * 1.2 + signal.lfilter(b2, a2, glottal) * 0.8 + signal.lfilter(b3, a3, glottal) * 0.4
    
    noise = np.random.uniform(-1, 1, N)
    b_br, a_br = signal.butter(2, [1600 / (SAMPLE_RATE/2), 4500 / (SAMPLE_RATE/2)], btype='bandpass')
    breath = signal.lfilter(b_br, a_br, noise) * 0.25
    
    env = (1.0 - np.exp(-t / 0.03)) * (1.0 - p**2)**0.8
    scream_mono = np.tanh((vocal + breath) * env * 1.5)
    
    taps = [(25, 0.2, 0.1, 3000), (50, 0.1, 0.18, 2000)]
    out_l, out_r = make_reverb_taps(scream_mono, taps)
    return normalize_and_master(np.vstack((out_l[:N], out_r[:N])), peak_db=-1.0)

def synth_spray():
    """Paint spray can: aerosol nozzle hiss + agitation ball bearing shake."""
    dur = 1.0
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    noise = np.random.uniform(-1, 1, N)
    b_hiss, a_hiss = signal.butter(2, [2800 / (SAMPLE_RATE/2), 14000 / (SAMPLE_RATE/2)], btype='bandpass')
    hiss = signal.lfilter(b_hiss, a_hiss, noise) * (1.0 - np.exp(-t / 0.02)) * (1.0 - (t/dur)**2) * 1.4
    
    rattle = np.zeros(N)
    for clk_t in [0.15, 0.38, 0.62, 0.82]:
        idx = int(clk_t * SAMPLE_RATE)
        c_len = int(0.008 * SAMPLE_RATE)
        if idx + c_len < N:
            c_noise = np.random.uniform(-1, 1, c_len) * np.exp(-np.linspace(0, 1, c_len) * 8.0)
            b_c, a_c = signal.butter(2, [3200 / (SAMPLE_RATE/2), 8500 / (SAMPLE_RATE/2)], btype='bandpass')
            rattle[idx:idx+c_len] += signal.lfilter(b_c, a_c, c_noise) * 0.45
            
    spray_mono = hiss + rattle
    return normalize_and_master(np.vstack((spray_mono, spray_mono)), peak_db=-1.2)

def synth_splash():
    """Water splash: low-frequency water cavity plop + bubbly surface spray."""
    dur = 0.8
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    plop_pitch = 190.0 * np.exp(-t / 0.04) + 60.0
    plop_phase = 2 * np.pi * np.cumsum(plop_pitch) / SAMPLE_RATE
    plop = np.sin(plop_phase) * np.exp(-t / 0.07) * 2.0
    
    noise = np.random.uniform(-1, 1, N)
    b_sp, a_sp = signal.butter(2, [900 / (SAMPLE_RATE/2), 6000 / (SAMPLE_RATE/2)], btype='bandpass')
    spray = signal.lfilter(b_sp, a_sp, noise) * np.exp(-t / 0.25) * (1.0 - np.exp(-t / 0.01)) * 1.5
    
    splash_mono = plop + spray
    l = splash_mono
    r = np.roll(splash_mono, int(SAMPLE_RATE * 0.003))
    return normalize_and_master(np.vstack((l, r)), peak_db=-1.0)

def synth_bust():
    """Busted / Mission Failed sting: deep ominous brass drop and heavy cell door slam."""
    dur = 1.8
    N = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, N, endpoint=False)
    
    sub_pitch = 80.0 * np.exp(-t / 0.6) + 32.0
    sub_phase = 2 * np.pi * np.cumsum(sub_pitch) / SAMPLE_RATE
    sub = np.sin(sub_phase) * np.exp(-t / 0.9) * 2.2
    
    brass = (np.sin(2 * np.pi * 155.56 * t) + np.sin(2 * np.pi * 164.81 * t)) * np.exp(-t / 0.7) * 0.8
    
    slam = np.zeros(N)
    idx = int(0.12 * SAMPLE_RATE)
    s_len = int(0.1 * SAMPLE_RATE)
    if idx + s_len < N:
        s_noise = np.random.uniform(-1, 1, s_len) * np.exp(-np.linspace(0, 1, s_len) * 7.0)
        b_s, a_s = signal.butter(2, [180 / (SAMPLE_RATE/2), 2400 / (SAMPLE_RATE/2)], btype='bandpass')
        slam[idx:idx+s_len] = signal.lfilter(b_s, a_s, s_noise) * 1.8
        
    dry = sub + brass + slam
    taps = [(50, 0.3, 0.15, 2500), (120, 0.15, 0.25, 1400), (280, 0.1, 0.12, 800)]
    out_l, out_r = make_reverb_taps(dry, taps)
    fade = np.minimum(1.0, (1.0 - t/dur)**1.2)
    return normalize_and_master(np.vstack((out_l[:N] * fade, out_r[:N] * fade)), peak_db=-0.8)

# ============================================================================
# MAIN DISPATCHER
# ============================================================================

GENERATORS = {
    'gunshot': synth_gunshot,
    'boom': synth_boom,
    'crash': synth_crash,
    'engine_idle': synth_engine_idle,
    'engine_loop': synth_engine_loop,
    'siren_loop': synth_siren_loop,
    'horn': synth_horn,
    'skid': synth_skid,
    'punch': synth_punch,
    'pickup_cash': synth_pickup_cash,
    'pickup_item': synth_pickup_item,
    'footstep': synth_footstep,
    'scream': synth_scream,
    'spray': synth_spray,
    'splash': synth_splash,
    'bust': synth_bust,
}

if __name__ == '__main__':
    requested = sys.argv[1:]
    targets = requested if requested else list(GENERATORS.keys())
    print(f"=== Synthesizing {len(targets)} High-Fidelity SFX Assets to {OUTPUT_DIR} ===")
    for name in targets:
        if name not in GENERATORS:
            print(f"  [!] Unknown sound: {name}")
            continue
        stereo = GENERATORS[name]()
        save_and_encode(name, stereo)
    print("=== Complete! All audio master files encoded to .ogg and .mp3 ===")
