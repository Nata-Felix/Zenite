"""Trilha original do comercial curto (40 s, 120 BPM), sintetizada localmente.

Estrutura em compassos de 2 s: subida (0–4 s), impacto e batida (4–32 s), segundo
impacto na volta ao plano geral (32 s) e acorde final aberto (36–40 s).
"""
from pathlib import Path
import math
import sys
import wave

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'out/video-tools/python'))
import numpy as np

RATE = 44100
SECONDS = int(sys.argv[1]) if len(sys.argv) > 1 else 40  # múltiplo de 2 (compassos)
BEAT = 0.5
rng = np.random.default_rng(43)
left = np.zeros(RATE * SECONDS, dtype=np.float32)
right = np.zeros(RATE * SECONDS, dtype=np.float32)


def add(start, signal, pan=0.0):
    offset = int(start * RATE)
    signal = signal[: max(0, len(left) - offset)]
    left[offset:offset + len(signal)] += signal * math.sqrt((1 - pan) / 2)
    right[offset:offset + len(signal)] += signal * math.sqrt((1 + pan) / 2)


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def tone(length, midi, volume, attack=0.01, decay=3.0, harmonics=(1, .25), detune=0.0):
    t = np.arange(int(length * RATE), dtype=np.float32) / RATE
    env = np.minimum(t / attack, 1) * np.exp(-t * decay)
    wave_ = sum(a * np.sin(2 * math.pi * hz(midi) * (i + 1) * (1 + detune) * t) for i, a in enumerate(harmonics))
    return (wave_ * env * volume).astype(np.float32)


def pad(length, midi, volume):
    t = np.arange(int(length * RATE), dtype=np.float32) / RATE
    env = np.minimum(t / 0.8, 1) * np.minimum((length - t) / 1.2, 1)
    f = hz(midi)
    signal = np.sin(2 * math.pi * f * t) + .5 * np.sin(2 * math.pi * f * 1.004 * t) + .3 * np.sin(2 * math.pi * f * 2.002 * t)
    return (signal * np.clip(env, 0, 1) * volume).astype(np.float32)


def kick(volume=.9):
    t = np.arange(int(.35 * RATE), dtype=np.float32) / RATE
    freq = 48 + 110 * np.exp(-t * 28)
    phase = 2 * math.pi * np.cumsum(freq) / RATE
    return (np.sin(phase) * np.exp(-t * 9) * volume).astype(np.float32)


def noise(length, volume, decay, highpass=True):
    n = rng.standard_normal(int(length * RATE)).astype(np.float32)
    if highpass:
        n = np.diff(n, prepend=0)
    t = np.arange(len(n), dtype=np.float32) / RATE
    return (n * np.exp(-t * decay) * volume).astype(np.float32)


def impact(volume=.8):
    t = np.arange(int(2.5 * RATE), dtype=np.float32) / RATE
    boom = np.sin(2 * math.pi * (38 + 40 * np.exp(-t * 6)) * t) * np.exp(-t * 1.6)
    return ((boom + .35 * noise(2.5, 1, 3.5, False)) * volume).astype(np.float32)


def riser(length, volume):
    t = np.arange(int(length * RATE), dtype=np.float32) / RATE
    n = np.diff(rng.standard_normal(len(t)).astype(np.float32), prepend=0)
    sweep = np.sin(2 * math.pi * (200 * t + 900 * t ** 2 / length))
    return ((n * .6 + sweep * .25) * (t / length) ** 2 * volume).astype(np.float32)


# Progressão em Ré menor: Dm – B♭ – F – C, um acorde por compasso de 2 s.
chords = [(50, 57, 62, 65), (46, 53, 58, 62), (53, 57, 60, 65), (48, 55, 60, 64)]
roots = [38, 34, 41, 36]
for bar in range(SECONDS // 2):
    start = bar * 2
    chord = chords[bar % 4]
    for i, note in enumerate(chord):
        add(start, pad(2.6, note, .05 if start < 4 else .035), (i - 1.5) / 3)
    if 4 <= start < SECONDS - 4:
        # Baixo em colcheias, kick em todo tempo, palmas no 2 e no 4, chimbal nas colcheias.
        for step in range(8):
            add(start + step * BEAT / 2, tone(.22, roots[bar % 4], .22, .005, 7, (1, .5, .2)))
        for beat in range(4):
            add(start + beat * BEAT, kick())
            if start >= 12:
                add(start + beat * BEAT + BEAT / 2, noise(.06, .10, 60), .3)
            if beat in (1, 3) and start >= 8:
                add(start + beat * BEAT, noise(.18, .22, 22), -.1)
        # Arpejo brilhante a partir de 20 s, quando entram os dados ao vivo.
        if start >= 20:
            for step, note in enumerate((chord + tuple(n + 12 for n in chord))[:8]):
                add(start + step * BEAT / 2, tone(.4, note + 12, .07, .004, 6, (1, .3)), .5 if step % 2 else -.5)

add(0, riser(4, .35))
add(4, impact())
add(SECONDS - 10, riser(2, .3))
add(SECONDS - 8, impact(.7))
for i, note in enumerate((50, 57, 62, 65, 69, 74)):
    add(SECONDS - 4, pad(4, note, .06), (i - 2.5) / 3)
add(SECONDS - 4, tone(4, 74, .12, .01, .9, (1, .4, .15)))

mix = np.stack([left, right], axis=1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)  # saturação leve, segura os picos
fade = np.ones(len(mix), dtype=np.float32)
fade[-RATE * 2:] = np.linspace(1, 0, RATE * 2)
mix = (mix * fade[:, None] * .8 * 32767).astype(np.int16)
out = ROOT / 'out/comercial-zenite/audio' / (sys.argv[2] if len(sys.argv) > 2 else 'trilha-spot.wav')
with wave.open(str(out), 'wb') as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(RATE)
    f.writeframes(mix.tobytes())
print(out)
