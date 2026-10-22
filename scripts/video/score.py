"""Trilha instrumental original, sintetizada localmente, sem voz ou áudio de referência."""
from pathlib import Path
import sys
import wave
import math

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'out/video-tools/python'))
import numpy as np

def compose(seconds=154, output=None):
    rate = 44100
    count = int(seconds * rate)
    left = np.zeros(count, dtype=np.float32)
    right = np.zeros(count, dtype=np.float32)

    def note(start, length, midi, volume, pan=0, pad=False):
        offset = int(start * rate)
        samples = min(int(length * rate), count - offset)
        if samples <= 0:
            return
        t = np.arange(samples, dtype=np.float32) / rate
        hz = 440 * 2 ** ((midi - 69) / 12)
        if pad:
            envelope = np.minimum(t / 1.2, 1) * np.minimum((length - t) / 1.6, 1)
            signal = (np.sin(2 * math.pi * hz * t) + .25 * np.sin(2 * math.pi * hz * 1.002 * t)) * envelope * volume
        else:
            envelope = np.minimum(t / .012, 1) * np.exp(-t * 3.6)
            signal = (np.sin(2 * math.pi * hz * t) + .20 * np.sin(2 * math.pi * hz * 2 * t)) * envelope * volume
        left[offset:offset + samples] += signal * math.sqrt((1 - pan) / 2)
        right[offset:offset + samples] += signal * math.sqrt((1 + pan) / 2)

    beat = 60 / 104
    chords = [(48, 55, 60, 63), (44, 51, 56, 60), (51, 58, 63, 67), (46, 53, 58, 62)]
    pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    for bar in range(math.ceil(seconds / (4 * beat))):
        start = bar * 4 * beat
        chord = chords[(bar // 2) % len(chords)]
        for i, pitch in enumerate(chord):
            note(start, 4 * beat + 1.5, pitch, .025, (i - 1.5) / 3, pad=True)
        if start > 7:
            note(start, 1.2, chord[0] - 12, .10)
            note(start + 2 * beat, 1, chord[0] - 12, .065)
        for step, index in enumerate(pattern):
            if start < 4 and step > 2:
                continue
            note(start + step * beat / 2, 1.9, chord[index] + 12, .028, (-.45 if step % 2 else .45))
    fade = np.minimum(np.arange(count) / (rate * 3), 1)
    fade *= np.minimum((count - np.arange(count)) / (rate * 5), 1)
    stereo = np.stack((left * fade, right * fade), axis=1)
    stereo = np.tanh(stereo * 1.35) * .63
    pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    output = Path(output or ROOT / 'out/comercial-zenite/audio/trilha-original.wav')
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), 'wb') as file:
        file.setnchannels(2)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(pcm.tobytes())
    print(f'Trilha original sem voz: {output.name}, {seconds}s')

if __name__ == '__main__':
    compose(float(sys.argv[1]) if len(sys.argv) > 1 else 154)
