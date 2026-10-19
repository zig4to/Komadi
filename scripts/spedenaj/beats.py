"""Akord po udarcih za skill "spedenaj" (dopolnjevanje akordov nad besedilom).

audio.py da akord po pol takta — za postavitev akorda nad pravi zlog je pregrobo.
Ta skripta za vsak udarec (downbeat + k·beat iz a.json) izpiše oceno akordov taba
(trozvoki iz kromagrama), da se vidi, na katerem udarcu se akord zamenja.

Uporaba:
  <venv>\\Scripts\\python scripts/spedenaj/beats.py <videoId> --from 30 --to 70 \\
      --downbeat 0.788 --beat 0.512 --chords Am,C,D,Dm,G [--out b.txt]
Vrstica: "čas  najboljši  Am0.71 C0.60 …". Zvok se po analizi izbriše.
"""

import argparse
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio as A  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--from", dest="t0", type=float, default=0)
    p.add_argument("--to", dest="t1", type=float, default=1e9)
    p.add_argument("--downbeat", type=float, required=True)
    p.add_argument("--beat", type=float, required=True)
    p.add_argument("--chords", required=True, help="imena akordov taba, ločena z vejico (trozvoki: Am, C, D …)")
    p.add_argument("--out")
    a = p.parse_args()
    with tempfile.TemporaryDirectory() as d:
        path, _ = A.download(a.video, d)
        x = A.decode(path)
    c, times = A.chroma_frames(x, hop=512, win=4096)
    keys, T = A.templates()
    want = [n.strip() for n in a.chords.split(",") if n.strip() in keys]
    idx = [keys.index(n) for n in want]
    end = min(a.t1, len(x) / A.SR)
    t = a.downbeat + np.ceil((a.t0 - a.downbeat) / a.beat) * a.beat
    rows = []
    while t < end:
        s = T[idx] @ A.mean_chroma(c, times, t, t + a.beat)
        rows.append(f"{t:7.2f} {want[int(np.argmax(s))]:4} " + " ".join(f"{n}{v:.2f}" for n, v in zip(want, s)))
        t += a.beat
    text = "\n".join(rows)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
