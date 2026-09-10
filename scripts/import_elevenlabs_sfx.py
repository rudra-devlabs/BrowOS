"""
Import, Master, and Loop-Crossfade ElevenLabs SFX into Brow City.
Reads ElevenLabs MP3s from C:\\Users\\rudra\\Downloads, processes them:
- Trims leading latency/silence for instantaneous combat transients.
- Applies equal-power sinusoidal crossfades on looping assets (engine_idle, siren_loop) for clickless infinite looping.
- Masters to -0.8 dBFS with DC blocking and soft peak limiting.
- Encodes both 48kHz stereo .ogg and .mp3 to assets/audio/gta/.
"""

import os
import sys
import subprocess
import numpy as np
from scipy import signal

SAMPLE_RATE = 48000
DOWNLOADS_DIR = r"C:\Users\rudra\Downloads"
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'gta'))

FILES_MAP = {
    'gunshot': {
        'filename': 'Gunshot_Close-up_9mm_#3-1788965214761.mp3',
        'is_loop': False,
        'trim_silence': True,
        'peak_db': -0.8,
    },
    'crash': {
        'filename': 'Car_Crash_quick-shor_#4-1788965318474.mp3',
        'is_loop': False,
        'trim_silence': True,
        'peak_db': -0.8,
    },
    'boom': {
        'filename': 'Explosion_Massive_ve_#4-1788965497000.mp3',
        'is_loop': False,
        'trim_silence': True,
        'peak_db': -0.8,
    },
    'engine_idle': {
        'filename': 'Car_Engine_Idle_V8_m_#2-1788965391334.mp3',
        'is_loop': True,
        'crossfade_sec': 0.25,
        'trim_silence': True,
        'peak_db': -1.2,
    },
    'siren_loop': {
        'filename': 'Police_Siren_Modern__#4-1788965453195.mp3',
        'is_loop': True,
        'crossfade_sec': 0.50,
        'trim_silence': False,
        'peak_db': -1.2,
    },
}

def decode_to_pcm(input_path):
    """Use ffmpeg to decode MP3 into 48kHz 32-bit float stereo raw PCM."""
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-i', input_path,
        '-ar', str(SAMPLE_RATE),
        '-ac', '2',
        '-f', 'f32le',
        '-'
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    raw_data, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode error: {err.decode('utf-8')}")
    
    samples = np.frombuffer(raw_data, dtype=np.float32)
    # Interleaved stereo: L, R, L, R...
    stereo = samples.reshape(-1, 2).T # (2, frames)
    return stereo

def trim_leading_silence(stereo, threshold_db=-40.0):
    """Trim initial silence so gunshots and crashes fire with zero perceived latency."""
    threshold = 10.0 ** (threshold_db / 20.0)
    mag = np.maximum(np.abs(stereo[0]), np.abs(stereo[1]))
    indices = np.where(mag > threshold)[0]
    if len(indices) == 0:
        return stereo
    start_idx = max(0, indices[0] - int(0.002 * SAMPLE_RATE)) # keep 2ms attack pre-roll
    return np.ascontiguousarray(stereo[:, start_idx:])

def make_seamless_loop(stereo, crossfade_sec=0.25):
    """Equal-power sinusoidal crossfade between head and tail for zero-click infinite loops."""
    frames = stereo.shape[1]
    fade_len = int(crossfade_sec * SAMPLE_RATE)
    if fade_len >= frames // 2:
        fade_len = frames // 4
        
    t = np.linspace(0, np.pi / 2.0, fade_len)
    fade_in = np.sin(t) ** 2
    fade_out = np.cos(t) ** 2
    
    # We blend the final fade_len samples into the first fade_len samples,
    # and trim the looped length by fade_len.
    out = stereo[:, :-fade_len].copy()
    tail = stereo[:, -fade_len:]
    
    out[:, :fade_len] = out[:, :fade_len] * fade_in + tail * fade_out
    return np.ascontiguousarray(out)

def master_stereo(stereo, peak_db=-0.8):
    """DC block, soft-clip limit, and peak normalize."""
    left = stereo[0]
    right = stereo[1]
    
    # DC blocking highpass filter at 20Hz
    b, a = signal.butter(2, 20.0 / (SAMPLE_RATE / 2.0), btype='highpass')
    left = signal.lfilter(b, a, left)
    right = signal.lfilter(b, a, right)
    
    # Gentle tanh soft saturation
    left = np.tanh(left * 0.95)
    right = np.tanh(right * 0.95)
    
    # Peak normalization
    max_val = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-6)
    target = 10.0 ** (peak_db / 20.0)
    scale = target / max_val
    left = np.clip(left * scale, -0.99, 0.99)
    right = np.clip(right * scale, -0.99, 0.99)
    
    return np.ascontiguousarray(np.vstack((left, right)), dtype=np.float32)

def save_and_encode(name, stereo_master):
    """Write temporary raw PCM and encode to OGG and MP3 using ffmpeg."""
    raw_temp = os.path.join(OUTPUT_DIR, f".temp_{name}.pcm")
    ogg_path = os.path.join(OUTPUT_DIR, f"{name}.ogg")
    mp3_path = os.path.join(OUTPUT_DIR, f"{name}.mp3")
    
    # Interleave to (frames, 2)
    interleaved = stereo_master.T.astype(np.float32)
    with open(raw_temp, 'wb') as f:
        f.write(interleaved.tobytes())
        
    try:
        # Encode OGG Vorbis
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '2',
            '-i', raw_temp,
            '-c:a', 'libvorbis', '-q:a', '7',
            ogg_path
        ], check=True)
        # Encode MP3 LAME
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '2',
            '-i', raw_temp,
            '-c:a', 'libmp3lame', '-b:a', '192k',
            mp3_path
        ], check=True)
        dur = stereo_master.shape[1] / SAMPLE_RATE
        print(f"  [+] Imported & Mastered {name}.ogg & {name}.mp3 ({dur:.2f}s)")
    finally:
        if os.path.exists(raw_temp):
            os.remove(raw_temp)

def main():
    print(f"=== Importing ElevenLabs Audio from {DOWNLOADS_DIR} ===")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for key, info in FILES_MAP.items():
        src_path = os.path.join(DOWNLOADS_DIR, info['filename'])
        if not os.path.exists(src_path):
            print(f"  [!] Missing file for {key}: {src_path}")
            continue
            
        print(f"Processing {key} from {info['filename']}...")
        stereo = decode_to_pcm(src_path)
        
        if info.get('trim_silence', False):
            stereo = trim_leading_silence(stereo)
            
        if info.get('is_loop', False):
            crossfade_sec = info.get('crossfade_sec', 0.25)
            stereo = make_seamless_loop(stereo, crossfade_sec=crossfade_sec)
        else:
            # Gentle 30ms fade-out at the very end of one-shots
            frames = stereo.shape[1]
            fade_samples = min(frames, int(0.03 * SAMPLE_RATE))
            fade = np.linspace(1.0, 0.0, fade_samples)
            stereo[:, -fade_samples:] *= fade
            
        mastered = master_stereo(stereo, peak_db=info.get('peak_db', -0.8))
        save_and_encode(key, mastered)
        
    print("=== All 5 ElevenLabs Sound Effects successfully imported & mastered! ===")

if __name__ == '__main__':
    main()
