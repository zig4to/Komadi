"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Uglaševalec (⋮ meni → Uglaševalec): mikrofon prek Web Audio, višina tona z
// algoritmom YIN, kazalec v centih glede na najbližjo struno izbrane uglasitve
// (ali na struno, ki jo uporabnik izbere s tapom).

type Tuning = { id: string; name: string; notes: { label: string; midi: number }[] };

function strings(spec: string): { label: string; midi: number }[] {
  // "E2 A2 D3" → MIDI številke (C4 = 60).
  const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return spec.split(" ").map((s) => {
    const m = /^([A-G])([#b]?)(\d)$/.exec(s)!;
    const midi = 12 * (Number(m[3]) + 1) + BASE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    return { label: m[1] + m[2], midi };
  });
}

const TUNINGS: Tuning[] = [
  { id: "standard", name: "Standard", notes: strings("E2 A2 D3 G3 B3 E4") },
  { id: "dropd", name: "Drop D", notes: strings("D2 A2 D3 G3 B3 E4") },
  { id: "eb", name: "Pol tona nižje", notes: strings("Eb2 Ab2 Db3 Gb3 Bb3 Eb4") },
  { id: "d", name: "Ton nižje", notes: strings("D2 G2 C3 F3 A3 D4") },
  { id: "dropc", name: "Drop C", notes: strings("C2 G2 C3 F3 A3 D4") },
  { id: "dadgad", name: "DADGAD", notes: strings("D2 A2 D3 G3 A3 D4") },
  { id: "openg", name: "Open G", notes: strings("D2 G2 D3 G3 B3 D4") },
  { id: "opend", name: "Open D", notes: strings("D2 A2 D3 F#3 A3 D4") },
  { id: "opene", name: "Open E", notes: strings("E2 B2 E3 G#3 B3 E4") },
  { id: "bass", name: "Bas", notes: strings("E1 A1 D2 G2") },
  { id: "ukulele", name: "Ukulele", notes: strings("G4 C4 E4 A4") },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TUNING_KEY = "komadi:tuner:tuning";
const A4_KEY = "komadi:tuner:a4";
// |centi| pod to mejo = uglašeno.
const IN_TUNE = 5;
// Najbližja struna samo, če je ton od nje oddaljen manj kot toliko centov.
const STRING_RANGE = 350;
// Najnižji iskani ton: najnižja struna uglasitve × 0,7 (≈ 6 poltonov nižje), ne pod 30 Hz —
// ožje območje = manj računanja (YIN je O(okno × tauMax)).
const MIN_FREQ_FLOOR = 30;
const MAX_FREQ = 1200;
// Pod to glasnostjo (RMS) ni signala.
const MIN_RMS = 0.008;
// Zadnje meritve ostanejo (zatemnjene) še toliko ms po tišini.
const HOLD_MS = 1500;
const DETECT_EVERY_MS = 60;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// YIN (de Cheveigné & Kawahara): vrne frekvenco ali null. `diff` je
// predalociran delovni niz dolžine ≥ tauMax + 1.
function detectPitch(buf: Float32Array, sampleRate: number, diff: Float32Array, minFreq: number): number | null {
  const half = Math.floor(buf.length / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const tauMax = Math.min(half - 1, Math.ceil(sampleRate / minFreq), diff.length - 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = buf[i] - buf[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  // Kumulativno normirana razlika.
  diff[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    diff[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (diff[t] < 0.12) {
      while (t + 1 <= tauMax && diff[t + 1] < diff[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Parabolična interpolacija okoli minimuma.
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = diff[tau - 1];
    const b = diff[tau];
    const c = diff[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return sampleRate / better;
}

function midiToFreq(midi: number, a4: number) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

type Reading = { freq: number; at: number };

export default function Tuner({ onClose }: { onClose: () => void }) {
  useBackableOpen(true, onClose);

  const [tuningId, setTuningId] = useState(() => readStored(TUNING_KEY) ?? "standard");
  const [a4, setA4] = useState(() => {
    const v = Number(readStored(A4_KEY));
    return v >= 420 && v <= 460 ? v : 440;
  });
  // Izbrana struna (indeks) ali null = samodejno (najbližja).
  const [lockedString, setLockedString] = useState<number | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  const tuning = TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const minFreqRef = useRef(MIN_FREQ_FLOOR);
  useEffect(() => {
    const lowest = Math.min(...tuning.notes.map((s) => s.midi));
    minFreqRef.current = Math.max(MIN_FREQ_FLOOR, 0.7 * midiToFreq(lowest, a4));
  }, [tuning, a4]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let wakeLock: { release: () => Promise<void> } | null = null;
    const recent: number[] = [];

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Ta brskalnik ne omogoča dostopa do mikrofona (potrebna je varna povezava https).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch {
        if (!cancelled) setError("Dostop do mikrofona ni dovoljen. Dovoli ga v nastavitvah brskalnika in odpri uglaševalec znova.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        setSuspended(true);
        ctx.resume().then(() => setSuspended(false), () => {});
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const diff = new Float32Array(analyser.fftSize / 2);
      let lastDetect = 0;

      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        wakeLock = (await wl?.request("screen")) ?? null;
      } catch {}

      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop);
        if (ts - lastDetect < DETECT_EVERY_MS) return;
        lastDetect = ts;
        setNow(Date.now());
        analyser.getFloatTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        if (rms < MIN_RMS) {
          recent.length = 0;
          return;
        }
        const minFreq = minFreqRef.current;
        const f = detectPitch(buf, ctx.sampleRate, diff, minFreq);
        if (f == null || f < minFreq || f > MAX_FREQ) return;
        // Mediana zadnjih 5 meritev; skok za več kot pol tona začne znova.
        if (recent.length && Math.abs(1200 * Math.log2(f / recent[recent.length - 1])) > 50) recent.length = 0;
        recent.push(f);
        if (recent.length > 5) recent.shift();
        const sorted = [...recent].sort((x, y) => x - y);
        setReading({ freq: sorted[Math.floor(sorted.length / 2)], at: Date.now() });
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      wakeLock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const live = reading != null && now - reading.at < HOLD_MS;
  const fresh = reading != null && now - reading.at < 250;

  // Cilj: izbrana struna, sicer najbližja struna uglasitve, sicer najbližja nota.
  let target: { label: string; midi: number; stringIndex: number | null } | null = null;
  let cents = 0;
  if (live && reading) {
    const centsTo = (midi: number) => 1200 * Math.log2(reading.freq / midiToFreq(midi, a4));
    if (lockedString != null && tuning.notes[lockedString]) {
      const s = tuning.notes[lockedString];
      target = { ...s, stringIndex: lockedString };
    } else {
      let best = -1;
      let bestAbs = Infinity;
      tuning.notes.forEach((s, i) => {
        const c = Math.abs(centsTo(s.midi));
        if (c < bestAbs) {
          bestAbs = c;
          best = i;
        }
      });
      if (best >= 0 && bestAbs < STRING_RANGE) target = { ...tuning.notes[best], stringIndex: best };
      else {
        const midi = Math.round(69 + 12 * Math.log2(reading.freq / a4));
        target = { label: NOTE_NAMES[((midi % 12) + 12) % 12], midi, stringIndex: null };
      }
    }
    cents = centsTo(target.midi);
  }

  const inTune = live && Math.abs(cents) < IN_TUNE;
  const clamped = Math.max(-50, Math.min(50, cents));
  const octave = target ? Math.floor(target.midi / 12) - 1 : null;
  const tone = !live
    ? "text-neutral-500"
    : inTune
      ? "text-emerald-500 dark:text-emerald-400"
      : Math.abs(cents) < 15
        ? "text-amber-500 dark:text-amber-400"
        : "text-orange-500 dark:text-orange-400";
  const needleColor = inTune ? "bg-emerald-500" : Math.abs(cents) < 15 ? "bg-amber-500" : "bg-orange-500";

  let hint = "Zaigraj struno";
  if (live) hint = inTune ? "Uglašeno" : cents < 0 ? "Prenizko — privij" : "Previsoko — popusti";

  function pickTuning(id: string) {
    setTuningId(id);
    setLockedString(null);
    writeStored(TUNING_KEY, id);
  }
  function changeA4(delta: number) {
    const next = Math.max(420, Math.min(460, a4 + delta));
    setA4(next);
    writeStored(A4_KEY, String(next));
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-view-portal
      className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900 dark:bg-[#0d0d10] dark:text-neutral-100"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-orange-500">
          <path d="M12 3v3" />
          <path d="M5.6 5.6l2.1 2.1" />
          <path d="M18.4 5.6l-2.1 2.1" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="M12 12l4-5" />
          <circle cx="12" cy="12" r="1.5" />
          <path d="M5 19h14" />
        </svg>
        <h2 className="flex-1 text-base font-semibold">Uglaševalec</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zapri"
          className="rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium dark:border-white/10"
        >
          ✕
        </button>
      </div>

      {/* Uglasitev */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:thin]">
        {TUNINGS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickTuning(t.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              t.id === tuning.id
                ? "border-orange-400 bg-orange-400/15 text-orange-700 dark:text-orange-300"
                : "border-neutral-300 text-neutral-600 dark:border-white/10 dark:text-neutral-300"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        {error ? (
          <p className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <>
            {suspended && (
              <button
                type="button"
                onClick={() => ctxRef.current?.resume().then(() => setSuspended(false), () => {})}
                className="rounded-full border border-orange-400 bg-orange-400/15 px-4 py-2 text-sm font-semibold text-orange-700 dark:text-orange-300"
              >
                Tapni za začetek
              </button>
            )}

            {/* Nota */}
            <div className={`flex items-start transition-opacity ${fresh ? "opacity-100" : live ? "opacity-60" : "opacity-30"} ${tone}`}>
              <span className="text-8xl leading-none font-bold tabular-nums">{target?.label ?? "–"}</span>
              {octave != null && <span className="mt-2 text-2xl font-semibold">{octave}</span>}
            </div>

            {/* Kazalec: −50 … +50 centov */}
            <div className="w-full max-w-md">
              <div className="relative h-16">
                <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-neutral-300 dark:bg-neutral-700" />
                <div
                  className="absolute top-1 bottom-1 rounded bg-emerald-500/20"
                  style={{ left: `${50 - IN_TUNE}%`, width: `${IN_TUNE * 2}%` }}
                />
                {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => (
                  <div
                    key={c}
                    className={`absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 ${c === 0 ? "h-12 bg-emerald-500" : c % 50 === 0 ? "h-8 bg-neutral-400 dark:bg-neutral-500" : "h-4 bg-neutral-300 dark:bg-neutral-600"}`}
                    style={{ left: `${50 + c}%` }}
                  />
                ))}
                {live && (
                  <div
                    className={`absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded-full transition-[left] duration-100 ease-out ${needleColor}`}
                    style={{ left: `${50 + clamped}%` }}
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
                <span>−50</span>
                <span>0</span>
                <span>+50</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <p className={`text-lg font-semibold ${tone}`}>{hint}</p>
              <p className="text-sm text-neutral-500 tabular-nums">
                {live && reading ? `${reading.freq.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${Math.round(cents)} centov` : " "}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Strune: tap = uglaševanje samo te strune, ponoven tap = samodejno */}
      <div className="flex flex-col items-center gap-3 border-t border-neutral-200 px-4 py-4 dark:border-white/[0.08]">
        <div className="flex flex-wrap justify-center gap-2">
          {tuning.notes.map((s, i) => {
            const active = target?.stringIndex === i;
            const locked = lockedString === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setLockedString(locked ? null : i)}
                title={locked ? "Nazaj na samodejno" : "Uglašuj samo to struno"}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 text-base font-semibold transition-colors ${
                  active && inTune
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : active
                      ? "border-orange-400 bg-orange-400/15 text-orange-600 dark:text-orange-300"
                      : locked
                        ? "border-orange-400 text-orange-600 dark:text-orange-300"
                        : "border-neutral-300 text-neutral-600 dark:border-white/10 dark:text-neutral-300"
                }`}
              >
                {s.label}
                <span className="text-[9px] leading-none font-normal opacity-60">{Math.floor(s.midi / 12) - 1}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>{lockedString == null ? "Samodejno (najbližja struna)" : "Izbrana struna — tapni jo za samodejno"}</span>
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => changeA4(-1)} aria-label="A4 nižje" className="h-6 w-6 rounded-full border border-neutral-300 dark:border-white/10">
              −
            </button>
            <span className="tabular-nums">A4 = {a4} Hz</span>
            <button type="button" onClick={() => changeA4(1)} aria-label="A4 višje" className="h-6 w-6 rounded-full border border-neutral-300 dark:border-white/10">
              +
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
