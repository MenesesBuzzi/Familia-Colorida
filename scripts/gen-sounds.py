#!/usr/bin/env python3
"""Gera os sons originais do Lobisomem (assets/sounds/*.mp3) de forma 100% procedural.

Nada de material com direitos autorais: tudo é sintetizado aqui com senos, ruído e envelopes.
Uso:  python3 scripts/gen-sounds.py   (precisa do ffmpeg no PATH para converter WAV -> MP3)
"""
import math
import os
import random
import struct
import subprocess
import tempfile
import wave

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'sounds')
random.seed(7)
TAU = 2 * math.pi


def zeros(sec):
    return [0.0] * int(sec * SR)


def add(buf, sig, start=0.0, gain=1.0):
    s = int(start * SR)
    for i, v in enumerate(sig):
        j = s + i
        if 0 <= j < len(buf):
            buf[j] += v * gain
    return buf


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    out = []
    for i in range(n):
        if i < a_n:
            e = i / max(1, a_n)
        elif i < a_n + d_n:
            e = 1 - (1 - s) * (i - a_n) / max(1, d_n)
        elif i > n - r_n:
            e = s * max(0.0, (n - i) / max(1, r_n))
        else:
            e = s
        out.append(e)
    return out


def tone(freq, sec, kind='sine', vib=0.0, vib_rate=5.0, glide_to=None, partials=None):
    n = int(sec * SR)
    out = []
    ph = 0.0
    for i in range(n):
        t = i / SR
        f = freq if glide_to is None else freq + (glide_to - freq) * (i / n)
        f *= 1 + vib * math.sin(TAU * vib_rate * t)
        ph += TAU * f / SR
        if partials:
            v = sum(amp * math.sin(ph * k) for k, amp in partials)
        elif kind == 'tri':
            v = 2 / math.pi * math.asin(math.sin(ph))
        elif kind == 'saw':
            v = ((ph / TAU) % 1) * 2 - 1
        else:
            v = math.sin(ph)
        out.append(v)
    return out


def noise(sec):
    return [random.uniform(-1, 1) for _ in range(int(sec * SR))]


def lowpass(sig, cutoff):
    rc = 1 / (TAU * cutoff)
    a = (1 / SR) / (rc + 1 / SR)
    y, out = 0.0, []
    for v in sig:
        y += a * (v - y)
        out.append(y)
    return out


def highpass(sig, cutoff):
    low = lowpass(sig, cutoff)
    return [v - l for v, l in zip(sig, low)]


def mul(sig, env):
    return [v * e for v, e in zip(sig, env)]


def decay(n, tau):
    return [math.exp(-i / SR / tau) for i in range(n)]


def fade(buf, fin=0.05, fout=0.05):
    n = len(buf)
    a, b = int(fin * SR), int(fout * SR)
    for i in range(min(a, n)):
        buf[i] *= i / a
    for i in range(min(b, n)):
        buf[n - 1 - i] *= i / b
    return buf


def loopify(buf, xf=0.4):
    """Cruza o fim com o começo para o loop não 'estalar'."""
    x = int(xf * SR)
    head, body = buf[:x], buf[x:]
    for i in range(x):
        k = i / x
        body[len(body) - x + i] = body[len(body) - x + i] * (1 - k) + head[i] * k
    return body


def normalize(buf, peak=0.85):
    m = max(1e-9, max(abs(v) for v in buf))
    return [v * peak / m for v in buf]


def save(name, buf, bitrate='40k'):
    os.makedirs(OUT, exist_ok=True)
    buf = normalize(buf)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        path = tmp.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32767)) for v in buf))
    dst = os.path.join(OUT, f'{name}.mp3')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', bitrate, dst],
        check=True,
    )
    os.remove(path)
    print(f'{name}.mp3', os.path.getsize(dst), 'bytes')


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- sons
def crickets(sec):
    buf = zeros(sec)
    t = 0.1
    while t < sec - 0.3:
        f = random.choice([4200, 4500, 4800])
        chirp = mul(tone(f, 0.05), env_adsr(int(0.05 * SR), 0.005, 0.01, 0.8, 0.02))
        for k in range(3):
            add(buf, chirp, t + k * 0.065, 0.35)
        t += random.uniform(0.35, 0.9)
    return buf


def wind(sec, cutoff=500, gain=0.5):
    n = noise(sec)
    w = lowpass(lowpass(n, cutoff), cutoff)
    sway = [0.5 + 0.5 * math.sin(TAU * 0.13 * i / SR) * math.sin(TAU * 0.05 * i / SR + 1) for i in range(len(w))]
    return [v * s * gain * 4 for v, s in zip(w, sway)]


def gen_noite():
    sec = 10.4
    buf = zeros(sec)
    drone = [a + b for a, b in zip(tone(note(45), sec, vib=0.003, vib_rate=0.3), tone(note(52), sec, vib=0.004, vib_rate=0.2))]
    add(buf, drone, 0, 0.25)
    add(buf, wind(sec, 400), 0, 0.6)
    add(buf, crickets(sec), 0, 0.5)
    save('noite', loopify(buf))


def gen_dia():
    sec = 8.4
    buf = zeros(sec)
    chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]]
    for c, ch in enumerate(chords):
        for m in ch:
            pad = mul(tone(note(m), 2.2, kind='tri', vib=0.002), env_adsr(int(2.2 * SR), 0.4, 0.5, 0.6, 0.8))
            add(buf, pad, c * 2.0, 0.12)
        for k, m in enumerate([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]):
            pl = mul(tone(note(m), 0.4, partials=[(1, 1), (2, 0.3), (3, 0.1)]), decay(int(0.4 * SR), 0.12))
            add(buf, pl, c * 2.0 + k * 0.5, 0.18)
    # passarinhos
    for _ in range(7):
        t = random.uniform(0.2, sec - 0.6)
        f = random.uniform(2500, 3500)
        for k in range(random.randint(2, 4)):
            b = mul(tone(f, 0.08, glide_to=f * 1.3), env_adsr(int(0.08 * SR), 0.005, 0.02, 0.6, 0.03))
            add(buf, b, t + k * 0.11, 0.15)
    save('dia', loopify(buf, 0.3))


def gen_tensao():
    sec = 8.0
    buf = zeros(sec)
    beat = 0.5
    i = 0
    t = 0.0
    while t < sec:
        m = [40, 40, 41, 40][i % 4]
        hit = mul(tone(note(m), 0.45, partials=[(1, 1), (2, 0.4), (3, 0.2)]), decay(int(0.45 * SR), 0.15))
        add(buf, hit, t, 0.5)
        tick = mul(highpass(noise(0.03), 3000), decay(int(0.03 * SR), 0.01))
        add(buf, tick, t + beat / 2, 0.25)
        t += beat
        i += 1
    add(buf, tone(note(64), sec, vib=0.01, vib_rate=6), 0, 0.05)
    add(buf, tone(note(65), sec, vib=0.01, vib_rate=5.5), 0, 0.05)
    save('tensao', loopify(buf, 0.25))


def heartbeat_sig(sec, bpm=70):
    buf = zeros(sec)
    per = 60 / bpm
    t = 0.05
    while t < sec - 0.4:
        for off, g in ((0, 1.0), (0.22, 0.7)):
            th = mul(tone(55, 0.18, glide_to=40), decay(int(0.18 * SR), 0.05))
            add(buf, lowpass(th, 200), t + off, g)
        t += per
    return buf


def gen_coracao():
    sec = 60 / 70 * 5
    save('coracao', heartbeat_sig(sec + 0.1)[: int(sec * SR)])


def gen_morte():
    sec = 3.4
    buf = zeros(sec)
    for k, m in enumerate([62, 58, 55, 50]):
        p = mul(tone(note(m), 2.6 - k * 0.3, kind='saw'), env_adsr(int((2.6 - k * 0.3) * SR), 0.02, 0.4, 0.5, 1.2))
        add(buf, lowpass(p, 1200), k * 0.18, 0.18)
    add(buf, mul(tone(note(38), 3.0), decay(int(3.0 * SR), 1.0)), 0, 0.5)
    save('morte', fade(buf, 0.01, 0.3))


def gen_vitoria():
    sec = 4.2
    buf = zeros(sec)
    seq = [(60, 0.0, 0.25), (64, 0.25, 0.25), (67, 0.5, 0.25), (72, 0.75, 1.0)]
    for m, t, d in seq:
        for mm, g in ((m, 0.3), (m + 12, 0.1)):
            s = mul(tone(note(mm), d + 0.3, partials=[(1, 1), (2, 0.5), (3, 0.35), (4, 0.2)]), env_adsr(int((d + 0.3) * SR), 0.02, 0.1, 0.7, 0.2))
            add(buf, s, t, g)
    for m in (60, 64, 67, 72):
        s = mul(tone(note(m), 2.4, partials=[(1, 1), (2, 0.4), (3, 0.2)]), env_adsr(int(2.4 * SR), 0.05, 0.3, 0.6, 1.2))
        add(buf, s, 1.75, 0.18)
    roll = mul(highpass(noise(1.0), 1500), [min(1, i / SR * 1.5) for i in range(SR)])
    add(buf, roll, 0.75, 0.12)
    save('vitoria', fade(buf, 0.01, 0.4))


def howl_sig(sec=3.0, base=420):
    n = int(sec * SR)
    out = []
    ph = 0.0
    for i in range(n):
        x = i / n
        f = base + 260 * math.sin(math.pi * min(1, x * 1.6)) - 120 * max(0, x - 0.6)
        f *= 1 + 0.012 * math.sin(TAU * 5.5 * i / SR)
        ph += TAU * f / SR
        out.append(math.sin(ph) + 0.3 * math.sin(2 * ph) + 0.1 * math.sin(3 * ph))
    env = env_adsr(n, 0.35, 0.3, 0.8, 0.9)
    breath = lowpass(noise(sec), 2000)
    return [v * e + b * e * 0.15 for v, e, b in zip(out, env, breath)]


def gen_uivo():
    buf = zeros(3.4)
    add(buf, howl_sig(3.0), 0.05, 0.8)
    add(buf, howl_sig(2.4, 380), 0.9, 0.25)  # eco/segundo lobo
    save('uivo', fade(buf, 0.01, 0.2))


def gen_derrota():
    sec = 4.5
    buf = zeros(sec)
    add(buf, howl_sig(3.2, 400), 0.0, 0.6)
    for m in (45, 48, 52):
        p = mul(tone(note(m), 3.4, kind='saw'), env_adsr(int(3.4 * SR), 0.3, 0.6, 0.6, 1.5))
        add(buf, lowpass(p, 900), 0.9, 0.15)
    save('derrota', fade(buf, 0.01, 0.4))


def gen_sino():
    sec = 4.5
    buf = zeros(sec)
    for t in (0.0, 1.6):
        n = int((sec - t) * SR)
        partials = [(0.5, 0.5, 2.5), (1.0, 1.0, 1.8), (1.19, 0.6, 1.2), (1.56, 0.4, 0.9), (2.0, 0.35, 0.7), (2.74, 0.2, 0.5)]
        sig = [0.0] * n
        for ratio, amp, tau in partials:
            f = 330 * ratio
            for i in range(n):
                sig[i] += amp * math.sin(TAU * f * i / SR) * math.exp(-i / SR / tau)
        add(buf, sig, t, 0.5)
    save('sino', fade(buf, 0.002, 0.3))


def gen_trovao():
    sec = 4.5
    n = noise(sec)
    rumble = lowpass(lowpass(lowpass(n, 160), 160), 120)
    env = []
    for i in range(int(sec * SR)):
        t = i / SR
        crack = math.exp(-((t - 0.15) ** 2) / 0.002) * 1.5
        body = (1 - math.exp(-t * 6)) * math.exp(-t / 1.4)
        flicker = 0.7 + 0.3 * math.sin(TAU * 3 * t) * math.sin(TAU * 1.3 * t)
        env.append(crack + body * flicker)
    crack_noise = lowpass(n, 2500)
    buf = [r * e * 6 + c * math.exp(-((i / SR - 0.15) ** 2) / 0.003) * 0.6 for i, (r, e, c) in enumerate(zip(rumble, env, crack_noise))]
    save('trovao', fade(buf, 0.005, 0.5))


def gen_grilos():
    sec = 6.0
    buf = crickets(sec)
    add(buf, wind(sec, 250, 0.15), 0, 1)
    save('grilos', loopify(buf, 0.3))


def gen_tambor():
    sec = 3.2
    buf = zeros(sec)
    t, gap = 0.0, 0.11
    while t < 2.3:
        g = 0.2 + 0.6 * (t / 2.3)
        hit = mul(highpass(noise(0.06), 400), decay(int(0.06 * SR), 0.02))
        body = mul(tone(190, 0.06), decay(int(0.06 * SR), 0.03))
        add(buf, [a + b * 0.6 for a, b in zip(hit, body)], t, g)
        t += gap
        gap = max(0.035, gap * 0.93)
    boom = mul([a + b for a, b in zip(tone(70, 0.9, glide_to=45), lowpass(noise(0.9), 300))], decay(int(0.9 * SR), 0.3))
    add(buf, boom, 2.35, 1.0)
    crash = mul(highpass(noise(0.8), 3000), decay(int(0.8 * SR), 0.3))
    add(buf, crash, 2.35, 0.35)
    save('tambor', fade(buf, 0.005, 0.2))


def gen_vento():
    sec = 8.0
    buf = wind(sec, 700, 0.8)
    whistle = mul(tone(900, sec, vib=0.05, vib_rate=0.3), [0.5 + 0.5 * math.sin(TAU * 0.2 * i / SR) for i in range(int(sec * SR))])
    add(buf, whistle, 0, 0.04)
    save('vento', loopify(buf, 0.5))


if __name__ == '__main__':
    for fn in (gen_noite, gen_dia, gen_tensao, gen_coracao, gen_morte, gen_vitoria, gen_derrota, gen_uivo,
               gen_sino, gen_trovao, gen_grilos, gen_tambor, gen_vento):
        fn()
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.mp3'))
    print('total', total, 'bytes')
