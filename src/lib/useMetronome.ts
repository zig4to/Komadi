"use client";

import { useEffect, useRef } from "react";

// Metronom (pregledovalnik akordov, gumb "Metronom"): Web Audio, udarci so
// razporejeni vnaprej na uri AudioContext (ne s setTimeout neposredno), zato
// je ritem enakomeren tudi, ko je glavna nit zasedena. Prvi udarec takta
// (4/4) je višji. Sprememba bpm med igranjem velja od naslednjega udarca.
// prime() pokliči v kliku (gesta) — Safari na iPhonu drugače zvoka ne spusti.
const LOOKAHEAD_S = 0.12;
const TIMER_MS = 25;
const BEATS_PER_BAR = 4;

type Ctx = AudioContext;

export function useMetronome(bpm: number, on: boolean) {
  const bpmRef = useRef(bpm);
  const ctxRef = useRef<Ctx | null>(null);
  useEffect(() => {
    bpmRef.current = bpm;
  });
  const prime = () => {
    if (!ctxRef.current) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctxRef.current = new C();
    }
    void ctxRef.current.resume();
  };
  useEffect(() => {
    if (!on) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume();
    let next = ctx.currentTime + 0.05;
    let beat = 0;
    const click = (at: number, accent: boolean) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1600 : 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.06);
    };
    const id = setInterval(() => {
      // Zavihek je bil skrit (časovnik zaspi): ne nadoknaduj zamujenih udarcev.
      if (next < ctx.currentTime - 0.2) next = ctx.currentTime + 0.05;
      while (next < ctx.currentTime + LOOKAHEAD_S) {
        click(next, beat % BEATS_PER_BAR === 0);
        beat++;
        next += 60 / Math.max(20, bpmRef.current);
      }
    }, TIMER_MS);
    return () => clearInterval(id);
  }, [on]);
  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );
  return { prime };
}
