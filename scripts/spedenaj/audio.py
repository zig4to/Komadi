"""Zvočna analiza YouTube posnetka za skill "spedenaj".

Prenese zvok (yt-dlp), ga dekodira (ffmpeg iz imageio-ffmpeg) in izpiše JSON:
začetek glasbe, tempo, mreža taktov (prvi udarec takta) in po pol takta
najverjetnejši akord (kromagram) z glasnostjo. Zvok gre v začasno mapo in se
po analizi izbriše.

Okolje (enkrat):
  py -m venv "%LOCALAPPDATA%\\Komadi\\spedenaj-venv"
  "%LOCALAPPDATA%\\Komadi\\spedenaj-venv\\Scripts\\python" -m pip install yt-dlp imageio-ffmpeg numpy

Uporaba:
  <venv>\\Scripts\\python scripts/spedenaj/audio.py <videoId> [--out pot.json]
"""

import json
import os
import subprocess
import sys
import tempfile

import numpy as np

SR = 22050
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
# Trozvoki za oceno akorda iz kromagrama (intervali od korena). Štirizvoki
# (maj7, m6 …) so zavajali: Bbmaj7 = Bb + Dm je "zmagal" čez oba. Za primerjavo
# s tabom song.mjs uporabi surovi kromagram (chroma) in akorde taba.
KINDS = {"": [0, 4, 7], "m": [0, 3, 7]}


def download(video_id: str, folder: str) -> tuple[str, dict]:
    import yt_dlp

    opts = {
        "format": "bestaudio",
        "outtmpl": os.path.join(folder, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "noprogress": True,
        # YouTube brez JS runtime-a pogosto vrne 403 — Node je tako ali tako nameščen.
        "js_runtimes": {"node": {}},
        "retries": 3,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        path = ydl.prepare_filename(info)
    return path, {"title": info.get("title"), "channel": info.get("channel"), "duration": info.get("duration")}


def decode(path: str) -> np.ndarray:
    import imageio_ffmpeg

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    raw = subprocess.run([ff, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onset_envelope(x: np.ndarray, hop: int = 256, win: int = 1024):
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
    spec = np.log1p(100 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.concatenate([[0], np.maximum(0, np.diff(spec, axis=0)).sum(1)])
    flux = np.maximum(flux - np.convolve(flux, np.ones(16) / 16, "same"), 0)
    rms = np.sqrt((frames**2).mean(1))
    return flux, rms, SR / hop


def chroma_frames(x: np.ndarray, hop: int = 1024, win: int = 8192):
    n = (len(x) - win) // hop
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    f = np.fft.rfftfreq(win, 1 / SR)
    m = (f > 60) & (f < 2000)
    pc = (np.round(12 * np.log2(f[m] / 440) + 9) % 12).astype(int)
    c = np.zeros((n, 12))
    sm = spec[:, m]
    for k in range(12):
        c[:, k] = sm[:, pc == k].sum(1)
    times = (np.arange(n) * hop + win / 2) / SR
    return c, times


def templates():
    keys, rows = [], []
    for r in range(12):
        for kind, ints in KINDS.items():
            v = np.zeros(12)
            for i in ints:
                v[(r + i) % 12] = 1
            keys.append(NAMES[r] + kind)
            rows.append(v / np.linalg.norm(v))
    return keys, np.array(rows)


def mean_chroma(c, times, a, b):
    sel = (times >= a) & (times < b)
    if not sel.any():
        return np.zeros(12)
    v = c[sel].mean(0)
    return v / (np.linalg.norm(v) + 1e-9)


def analyze(x: np.ndarray) -> dict:
    flux, rms, fps = onset_envelope(x)
    duration = len(x) / SR
    music_start = float(np.argmax(rms > rms.max() * 0.05) / fps)
    # Tempo: avtokorelacija onset ovojnice, nato fino (0,01 BPM) po vsoti na mreži čez celo skladbo.
    seg = flux[int(music_start * fps):]
    ac = np.correlate(seg, seg, "full")[len(seg) - 1:]
    lo, hi = int(fps * 60 / 170), int(fps * 60 / 65)
    lag = lo + int(np.argmax(ac[lo:hi]))
    coarse = 60 * fps / lag

    def grid_score(period, phase):
        ts = np.arange(music_start + phase, duration, period)
        idx = (ts * fps).astype(int)
        idx = idx[idx < len(flux)]
        return flux[idx].sum()

    best = (-1.0, coarse, 0.0)
    for bpm in np.arange(coarse * 0.98, coarse * 1.02, 0.01):
        period = 60 / bpm
        for phase in np.arange(-period / 2, period / 2, 0.01):
            s = grid_score(period, phase)
            if s > best[0]:
                best = (s, bpm, phase)
    _, bpm, phase = best
    beat = 60 / bpm
    first_beat = music_start + phase
    while first_beat - beat > -0.05:
        first_beat -= beat
    # Prvi udarec takta: od 4 možnih zamikov tisti, pri katerem se kromagram med
    # sosednjima taktoma najbolj spremeni (akordi se menjajo na začetku takta).
    c, ct = chroma_frames(x)
    bar = 4 * beat
    best_phase, best_change = 0, -1.0
    for p in range(4):
        start = first_beat + p * beat
        starts = np.arange(start, duration - bar, bar)
        vecs = [mean_chroma(c, ct, s, s + bar) for s in starts]
        change = float(np.mean([1 - vecs[i] @ vecs[i - 1] for i in range(1, len(vecs))])) if len(vecs) > 2 else 0
        if change > best_change:
            best_change, best_phase = change, p
    downbeat = first_beat + best_phase * beat
    while downbeat - bar > music_start - 0.3:
        downbeat -= bar
    keys, T = templates()
    halves = []
    t = downbeat
    while t < duration:
        v = mean_chroma(c, ct, t, t + bar / 2)
        sc = T @ v
        o = np.argsort(-sc)[:3]
        a, b = int(t * SR), int((t + bar / 2) * SR)
        halves.append({
            "t": round(float(t), 3),
            "chords": [[keys[i], round(float(sc[i]), 3)] for i in o],
            "chroma": [round(float(c), 3) for c in v],
            "rms": round(float(np.sqrt((x[max(0, a):b] ** 2).mean())) if b > a else 0, 4),
        })
        t += bar / 2
    return {
        "duration": round(duration, 2),
        "musicStart": round(music_start, 3),
        "bpm": round(float(bpm), 2),
        "beat": round(beat, 4),
        "bar": round(bar, 4),
        "downbeat": round(float(downbeat), 3),
        "halfBars": halves,
    }


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    video_id = args[0]
    out = args[args.index("--out") + 1] if "--out" in args else None
    with tempfile.TemporaryDirectory(prefix="spedenaj-") as folder:
        path, meta = download(video_id, folder)
        x = decode(path)
    result = {"videoId": video_id, **meta, **analyze(x)}
    text = json.dumps(result, ensure_ascii=False)
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"{video_id}: {meta['title']} | {result['duration']} s | glasba od {result['musicStart']} s | "
              f"{result['bpm']} BPM | takt {result['bar']} s od {result['downbeat']} s -> {out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
