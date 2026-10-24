"use client";

import { useEffect, useRef, useState } from "react";
import type { ChordPosition } from "@/lib/chordShapes";
import { OPEN } from "@/lib/scales";

// Zvok kitare v brskalniku (Web Audio): brenkanje akorda (Karplus-Strong), klik
// metronoma in razporejevalnik udarcev na uri AudioContext. Uporabljata ga
// "Za začetnike" (Beginners.tsx) in "Pišem" (SongWriter.tsx).

export type AudioApi = { ctx: () => AudioContext | null; strum: (at: number, shape: ChordPosition, up: boolean, vol?: number, ringFor?: number) => void; click: (at: number, accent: boolean) => void };

export function useAudio(): AudioApi {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufs = useRef(new Map<number, AudioBuffer>());
  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );
  // Pokliči v kliku (gesta) — Safari na iPhonu drugače zvoka ne spusti.
  const ctx = () => {
    try {
      if (!ctxRef.current) {
        const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!C) return null;
        ctxRef.current = new C();
        bufs.current.clear();
      }
      if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {});
      return ctxRef.current;
    } catch {
      return null;
    }
  };
  // Struna (Karplus-Strong), predpomnjena po višini tona.
  const buffer = (c: AudioContext, midi: number) => {
    let b = bufs.current.get(midi);
    if (b) return b;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const sr = c.sampleRate;
    const n = Math.floor(sr * 1.4);
    b = c.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
    for (let i = 0; i < n; i++) {
      const j = i % period;
      d[i] = ring[j];
      ring[j] = 0.497 * (ring[j] + ring[(i + 1) % period]);
    }
    bufs.current.set(midi, b);
    return b;
  };
  // ringFor: koliko sekund akord zveni (do naslednjega udarca) — kot na kitari zveni
  // tudi čez zgrešen udarec, utihne šele ob naslednjem.
  const strum = (at: number, shape: ChordPosition, up: boolean, vol = 0.22, ringFor = 0.35) => {
    const c = ctxRef.current;
    if (!c) return;
    const notes = shape.frets
      .map((f, s) => (f < 0 ? null : OPEN[s] + (f === 0 ? 0 : f + shape.baseFret - 1)))
      .filter((m): m is number => m !== null);
    const order = up ? [...notes].reverse().slice(0, 4) : notes;
    order.forEach((midi, i) => {
      const src = c.createBufferSource();
      const g = c.createGain();
      src.buffer = buffer(c, midi);
      g.gain.setValueAtTime(up ? vol * 0.7 : vol, at);
      // Udarec utihne ob naslednjem, da se brenkanje ne zlije v eno zvonjenje.
      g.gain.setTargetAtTime(0.0001, at + ringFor, 0.05);
      src.connect(g).connect(c.destination);
      src.start(at + i * 0.011);
      src.stop(at + 1.4);
    });
  };
  const click = (at: number, accent: boolean) => {
    const c = ctxRef.current;
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  };
  return { ctx, strum, click };
}

// Razporejevalnik udarcev na uri AudioContext (kot useMetronome): onStep(korak,
// čas) za vsako podrazdelitev dobe; prikaz (setStep) ob času udarca.
export function useTicker(audio: AudioApi, on: boolean, bpm: number, perBeat: number, onStep: (step: number, at: number) => void) {
  const stepRef = useRef(onStep);
  const bpmRef = useRef(bpm);
  const [shown, setShown] = useState(-1);
  useEffect(() => {
    stepRef.current = onStep;
    bpmRef.current = bpm;
  });
  useEffect(() => {
    if (!on) return;
    const c = audio.ctx();
    if (!c) return;
    let next = c.currentTime + 0.08;
    let step = 0;
    const timers: number[] = [];
    const id = window.setInterval(() => {
      if (next < c.currentTime - 0.2) next = c.currentTime + 0.05;
      while (next < c.currentTime + 0.12) {
        const s = step;
        stepRef.current(s, next);
        timers.push(window.setTimeout(() => setShown(s), Math.max(0, (next - c.currentTime) * 1000)));
        step++;
        next += 60 / Math.max(20, bpmRef.current) / perBeat;
      }
      if (timers.length > 64) timers.splice(0, 32);
    }, 25);
    return () => {
      clearInterval(id);
      timers.forEach((t) => clearTimeout(t));
      setShown(-1);
    };
    // audio je stabilen za čas komponente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, perBeat]);
  return shown;
}
