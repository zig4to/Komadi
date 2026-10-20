"""Prepoznava petja za skill "spedenaj" (prototip samodejnih časov vrstic).

Prenese zvok (yt-dlp, kot audio.py), z Demucs izloči vokal in ga z Whisper
(faster-whisper) prepiše v besede s časi. Besedilo taba gre Whisperju kot
namig (initial_prompt), da laže ujame prave besede. Izpiše JSON:
  { videoId, duration, language, words: [ { w, start, end, p } ] }
Ujemanje besed z vrsticami taba naredi autosync.mjs. Zvok se po analizi izbriše.

Okolje (enkrat, poleg audio.py):
  <venv>\\Scripts\\python -m pip install faster-whisper demucs soundfile

Uporaba:
  <venv>\\Scripts\\python scripts/spedenaj/vocals.py <videoId> --lang sl [--prompt besedilo.txt]
      [--model large-v3-turbo] [--no-demucs] [--keep-vocals v.wav] --out w.json
  Drugi prehod (samo deli, kjer prvi ni ujel vrstic — Whisper pri ponovitvah refrena izpušča):
  <venv>\\Scripts\\python scripts/spedenaj/vocals.py <videoId> --vocals v.wav --clips 46-54,113-170 --out w2.json
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(__file__))
from audio import download  # noqa: E402


def to_wav(src: str, dst: str, sr: int, channels: int) -> None:
    import imageio_ffmpeg

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, "-v", "error", "-y", "-i", src, "-ac", str(channels), "-ar", str(sr), dst], check=True)


def separate_vocals(wav: str, folder: str) -> str:
    """Demucs (htdemucs, dva dela): vrne pot do vocals.wav."""
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs")
    model.eval()
    audio, sr = sf.read(wav, dtype="float32", always_2d=True)
    mix = torch.from_numpy(audio.T.copy())
    ref = mix.mean(0)
    mix = (mix - ref.mean()) / (ref.std() + 1e-8)
    with torch.no_grad():
        sources = apply_model(model, mix[None], device="cpu", shifts=0, split=True, overlap=0.25, progress=False)[0]
    vocals = sources[model.sources.index("vocals")] * (ref.std() + 1e-8) + ref.mean()
    out = os.path.join(folder, "vocals.wav")
    sf.write(out, vocals.numpy().T.astype(np.float32), sr)
    return out


def transcribe(wav: str, lang: str, prompt: str | None, model_name: str, clips: list[float] | None = None) -> tuple[list[dict], str]:
    from faster_whisper import WhisperModel

    import soundfile as sf

    # Zvok kot tabela (16 kHz mono), ne pot: dekodiranje faster-whisperja prek PyAV
    # ne dela z novejšim av ("unexpected keyword argument 'metadata_errors'").
    mono = wav + ".16k.wav"
    to_wav(wav, mono, 16000, 1)
    audio, _ = sf.read(mono, dtype="float32")

    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    segments, info = model.transcribe(
        audio,
        language=lang,
        word_timestamps=True,
        initial_prompt=prompt,
        # Petje: brez VAD (vokal je že izločen) in brez pogojevanja na prejšnji tekst,
        # sicer Whisper ob ponovitvah refrena "zatakne" in izpusti cele dele.
        vad_filter=False,
        condition_on_previous_text=False,
        beam_size=5,
        # Kratki izrezi (časi ostanejo absolutni): Whisper v njih ne preskoči ponovljenih vrstic.
        **({"clip_timestamps": clips} if clips else {}),
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "p": round(w.probability, 3)})
    return words, info.language


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--lang", default="sl")
    ap.add_argument("--prompt", help="datoteka z besedilom taba (namig za Whisper)")
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--no-demucs", action="store_true")
    ap.add_argument("--keep-vocals", help="shrani izločen vokal (wav) za drugi prehod")
    ap.add_argument("--vocals", help="že izločen vokal (wav) — brez prenosa in Demucs")
    ap.add_argument("--clips", help="samo ti izrezi v sekundah: 46-54,113-170")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    prompt = None
    if a.prompt:
        with open(a.prompt, encoding="utf-8") as f:
            # Whisper upošteva le ~224 žetonov namiga — začetek besedila je dovolj za besedišče.
            prompt = " ".join(f.read().split())[:600]

    clips = [float(x) for part in a.clips.split(",") for x in part.split("-")] if a.clips else None

    t0 = time.time()
    if a.vocals:
        words, lang = transcribe(a.vocals, a.lang, prompt, a.model, clips)
        print(f"whisper: {time.time() - t0:.0f} s, {len(words)} besed", file=sys.stderr)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump({"videoId": a.video, "duration": None, "language": lang, "clips": clips, "words": words}, f, ensure_ascii=False, indent=1)
        print(f"{a.video}: {len(words)} besed -> {a.out}")
        return
    with tempfile.TemporaryDirectory() as tmp:
        src, meta = download(a.video, tmp)
        wav = os.path.join(tmp, "mix.wav")
        to_wav(src, wav, 44100, 2)
        print(f"prenos: {time.time() - t0:.0f} s", file=sys.stderr)
        if a.no_demucs:
            voc = os.path.join(tmp, "mono.wav")
            to_wav(wav, voc, 16000, 1)
        else:
            voc = separate_vocals(wav, tmp)
            print(f"demucs: {time.time() - t0:.0f} s", file=sys.stderr)
            if a.keep_vocals:
                shutil.copyfile(voc, a.keep_vocals)
        words, lang = transcribe(voc, a.lang, prompt, a.model, clips)
        print(f"whisper: {time.time() - t0:.0f} s, {len(words)} besed", file=sys.stderr)

    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"videoId": a.video, "duration": meta.get("duration"), "language": lang, "words": words}, f, ensure_ascii=False, indent=1)
    print(f"{a.video}: {len(words)} besed -> {a.out}")


if __name__ == "__main__":
    main()
