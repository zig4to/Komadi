"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { FRETS, INTERVALS, NAMES, OPEN, SCALES, chordTones, intLabel, mod12, positionsOf, scaleById, type Scale } from "@/lib/scales";

// Lestvice (kartica na domači strani desno od Tunerja): vrat kitare v
// standardni uglasitvi z označeno lestvico — ton, lestvica, položaj (boks),
// note ali intervali na pikah. Tap na piko zaigra noto (Karplus-Strong),
// "Zaigraj lestvico" zaigra položaj gor in dol. Računalnik: vrat vodoravno
// (visoka e zgoraj kot v tabu), telefon: navpično (strune v stolpcih).

const KEY = "komadi:scales";
const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19];
// Povečava vratu (+ / − ob "Zaigraj lestvico"), skupna za Lestvice in Impro.
const ZOOM_KEY = "komadi:scales:zoom";
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
// Računalnik: "Prelomi vrat" — prečke 1–9 zgoraj, 10–19 v drugi vrsti pod njimi.
const SPLIT_KEY = "komadi:scales:split";
const SPLIT_FRET = 9;
function readZoom() {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    if (Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) return v;
  } catch {}
  return 1;
}

type Stored = { root: number; scale: string; pos: number; labels: "note" | "int" };
const DEFAULTS: Stored = { root: 9, scale: "minpent", pos: 1, labels: "note" };

function readStored(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v === "object") {
      return {
        root: Number.isInteger(v.root) && v.root >= 0 && v.root < 12 ? v.root : DEFAULTS.root,
        scale: SCALES.some((s) => s.id === v.scale) ? v.scale : DEFAULTS.scale,
        pos: Number.isInteger(v.pos) && v.pos >= -1 ? v.pos : DEFAULTS.pos,
        labels: v.labels === "int" ? "int" : "note",
      };
    }
  } catch {}
  return DEFAULTS;
}

const LG = "(min-width: 1024px)";
export function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(LG);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(LG).matches,
    () => true,
  );
}

const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition";
const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white dark:border-white/20 dark:bg-white/[0.14] dark:text-white";
const CHIP_OFF =
  "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.06]";
const LABEL = "mb-1.5 text-[11px] uppercase tracking-[0.06em] text-neutral-500";

export const CLOSE_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const CLOSE_BUTTON =
  "rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-neutral-200";

export default function Scales({ onClose }: { onClose: () => void }) {
  useBackableOpen(true, onClose);
  const [state, setState] = useState<Stored>(readStored);
  const sc = scaleById(state.scale);

  function update(patch: Partial<Stored>) {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-view-portal
      className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900 dark:bg-[#0d0d10] dark:text-neutral-100"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-indigo-500 dark:text-indigo-400">
          <path d="M3 6h18M3 10h18M3 14h18M3 18h18" />
          <circle cx="7" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="17" cy="16" r="1.4" fill="currentColor" />
        </svg>
        <h2 className="flex-1 text-base font-semibold">Lestvice</h2>
        <button type="button" onClick={onClose} aria-label="Zapri" title="Zapri" className={CLOSE_BUTTON}>
          {CLOSE_ICON}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-3.5">
          <div>
            <div className={LABEL}>Ton</div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {NAMES.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={i === state.root}
                  onClick={() => update({ root: i })}
                  className={`${CHIP} min-w-10 px-2.5 font-mono ${i === state.root ? CHIP_ON : CHIP_OFF}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={LABEL}>Lestvica</div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === sc.id}
                  onClick={() => update({ scale: s.id, pos: 1 })}
                  className={`${CHIP} ${s.id === sc.id ? CHIP_ON : CHIP_OFF}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ScaleBoard
          root={state.root}
          scale={sc}
          pos={state.pos}
          labels={state.labels}
          onPos={(pos) => update({ pos })}
          onLabels={(labels) => update({ labels })}
        />
      </div>
    </div>,
    document.body,
  );
}

// Položaji, note/intervali, "Zaigraj lestvico", opis in vrat kitare za eno
// lestvico — stran Lestvice in plošča Impro v pregledovalniku akordov.
export function ScaleBoard({
  root,
  scale: sc,
  pos: posIn,
  labels,
  onPos,
  onLabels,
  defaultZoom,
  compact = false,
  songChords,
  currentChord,
}: {
  root: number;
  scale: Scale;
  pos: number;
  labels: "note" | "int";
  onPos: (pos: number) => void;
  onLabels: (labels: "note" | "int") => void;
  // Začetna povečava (Impro: 100 % ob vsakem odprtju); takrat se ne shranjuje.
  defaultZoom?: number;
  // Impro: vse izbire v eni strnjeni vrstici brez napisov, opis in legenda v eni vrstici.
  compact?: boolean;
  // Impro: akordi skladbe za "Vsi toni" → označi akord.
  songChords?: string[];
  // Impro: akord, ki je zdaj na vrsti (možnost "Trenutna"); undefined = možnosti ni.
  currentChord?: string | null;
}) {
  const desktop = useIsDesktop();
  const [playing, setPlaying] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neckRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(() => defaultZoom ?? readZoom());
  const [splitPref, setSplitPref] = useState(() => {
    try {
      return localStorage.getItem(SPLIT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const split = splitPref && desktop;
  function toggleSplit() {
    const next = !splitPref;
    setSplitPref(next);
    try {
      localStorage.setItem(SPLIT_KEY, next ? "1" : "0");
    } catch {}
  }
  function setZoom(z: number) {
    const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;
    setZoomState(next);
    if (defaultZoom != null) return;
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {}
  }

  // "Vsi toni": kaj označiti med vsemi toni — "" nič, "current" akord, ki je zdaj na vrsti, sicer ime akorda.
  const [mark, setMark] = useState("");

  const positions = positionsOf(root, sc);
  const pos = posIn > positions.length ? 0 : posIn;
  // pos: -1 = "Vsi toni" (vsi toni na vratu, brez lestvice), 0 = "Cel vrat", n = položaj n.
  const allNotes = pos === -1;
  const active = pos > 0 ? positions[pos - 1] : null;
  const allInts = [...sc.base, ...(sc.extra ?? [])].sort((a, b) => a - b);
  const markName = !allNotes || !mark ? null : mark === "current" ? (currentChord ?? null) : mark;
  const markChord = markName ? chordTones(markName) : null;
  const markTones = markChord ? markChord.tones : null;
  const markRoot = markChord ? markChord.root : root;
  // Glavni akordi tonalitete lestvice (molova lestvica → i iv v III VI VII V, sicer I ii iii IV V vi).
  const minorish = sc.base.includes(3) && !sc.base.includes(4);
  const keyChords = [
    ...new Set(
      (minorish
        ? ([[0, true], [5, true], [7, true], [3, false], [8, false], [10, false], [7, false]] as const)
        : ([[0, false], [5, false], [7, false], [9, true], [2, true], [4, true]] as const)
      ).map(([d, m]) => NAMES[mod12(root + d)] + (m ? "m" : "")),
    ),
  ];
  const uniqueSongChords = [...new Set(songChords ?? [])].filter((c) => chordTones(c));
  const activeSet = active ? new Set(active.cells.map((c) => `${c[0]},${c[1]}`)) : null;

  // Nova lestvica, ton ali položaj ustavi predvajanje.
  const playKey = `${root}:${sc.id}:${pos}`;
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setPlaying(null);
    },
    [playKey],
  );

  useEffect(
    () => () => {
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  // Preprost zvok kitarske strune (Karplus-Strong), ustvarjen ob tapu.
  function pluck(midi: number) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (ctxRef.current ??= new Ctx());
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const sr = ctx.sampleRate;
      const n = Math.floor(sr * 1.6);
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const period = Math.max(2, Math.round(sr / freq));
      const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
      for (let i = 0; i < n; i++) {
        const j = i % period;
        d[i] = ring[j];
        ring[j] = 0.497 * (ring[j] + ring[(i + 1) % period]);
      }
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      src.buffer = buf;
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch {}
  }

  function stopPlaying() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(null);
  }

  // Zaigra izbrani položaj (pri "Cel vrat" prvi položaj) gor in nazaj dol.
  function playScale() {
    if (playing) {
      stopPlaying();
      return;
    }
    const cells = (active ?? positions[0])?.cells.slice() ?? [];
    cells.sort((a, b) => OPEN[a[0]] + a[1] - (OPEN[b[0]] + b[1]) || a[0] - b[0]);
    const seq = [...cells, ...cells.slice(0, -1).reverse()];
    let i = 0;
    const step = () => {
      if (i >= seq.length) {
        stopPlaying();
        return;
      }
      const [s, f] = seq[i++];
      setPlaying(`${s},${f}`);
      pluck(OPEN[s] + f);
      timerRef.current = setTimeout(step, 260);
    };
    step();
  }

  // Računalnik: izbrani položaj zapelji v vidno polje vodoravnega vratu.
  const FW = desktop ? 54 : 36;
  const SW = desktop ? 30 : 42;
  const PAD = 26;
  const NUT = 18;
  const activeStart = active?.start ?? null;
  useEffect(() => {
    const el = neckRef.current;
    if (!el || activeStart == null || !desktop || split) return;
    el.scrollTo({ left: Math.max(0, (PAD + NUT + activeStart * FW) * zoom - 80), behavior: "smooth" });
  }, [activeStart, desktop, split, FW, zoom]);

  const len = NUT + FRETS * FW;
  const wid = 5 * SW;
  const W = desktop ? len + PAD * 2 : wid + PAD * 2;
  const H = desktop ? wid + PAD * 2 : len + PAD * 2;
  // (struna, razdalja vzdolž vratu) → [x, y].
  const at = (s: number, d: number): [number, number] => (desktop ? [PAD + d, PAD + (5 - s) * SW] : [PAD + s * SW, PAD + d]);
  const fretD = (f: number) => (f === 0 ? NUT - 1 : NUT + f * FW);
  const noteD = (f: number) => (f === 0 ? NUT / 2 - 2 : NUT + (f - 0.5) * FW);

  const dots: React.ReactNode[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= FRETS; f++) {
      const midi = OPEN[s] + f;
      const iv = mod12(midi - root);
      if (!allNotes && !allInts.includes(iv)) continue;
      const key = `${s},${f}`;
      const pc = midi % 12;
      const isRoot = allNotes ? markTones != null && pc === markRoot : iv === 0;
      const isBlue = !allNotes && (sc.extra ?? []).includes(iv);
      const [x, y] = at(s, noteD(f));
      const dim = (activeSet != null && !activeSet.has(key)) || (markTones != null && !markTones.includes(pc));
      dots.push(
        <g key={key} onClick={() => pluck(midi)} className={`cursor-pointer transition-opacity ${dim ? "opacity-[0.18]" : ""}`}>
          <circle
            cx={x}
            cy={y}
            r={12}
            className={`${isRoot ? "fill-orange-500 dark:fill-orange-400" : isBlue ? "fill-sky-500 dark:fill-sky-400" : "fill-neutral-800 dark:fill-neutral-200"} ${
              playing === key ? "stroke-indigo-500 dark:stroke-indigo-400" : "stroke-transparent"
            }`}
            strokeWidth={3}
          />
          <text
            x={x}
            y={y + 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`pointer-events-none font-mono text-[11px] font-medium ${isRoot || isBlue ? "fill-white" : "fill-white dark:fill-neutral-900"}`}
          >
            {labels === "note" ? NAMES[midi % 12] : markChord ? INTERVALS[mod12(midi - markRoot)] : intLabel(iv, sc)}
          </text>
        </g>,
      );
    }
  }

  const board = desktop ? { x: PAD + NUT, y: PAD - 8, w: FRETS * FW, h: wid + 16 } : { x: PAD - 8, y: PAD + NUT, w: wid + 16, h: FRETS * FW };

  return (
    <>
      <div className={`flex flex-col border-b border-neutral-200 px-4 dark:border-white/[0.08] ${compact ? "py-2" : "gap-3 py-3.5"}`}>
        <div className={`flex flex-wrap ${compact ? "items-center gap-x-2.5 gap-y-2" : "items-end gap-x-5 gap-y-3"}`}>
          <div className="min-w-0" role="group" aria-label="Položaj">
            {!compact && <div className={LABEL}>Položaj</div>}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {/* "Vsi toni" + v istem gumbu spustni seznam, kaj označiti med vsemi toni. */}
              <span
                className={`inline-flex shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-full border text-sm transition ${
                  allNotes ? CHIP_ON : CHIP_OFF
                }`}
              >
                <button
                  type="button"
                  aria-pressed={allNotes}
                  onClick={() => onPos(-1)}
                  title="Vsi toni na vratu kitare, brez lestvice"
                  className="py-1.5 pl-3 pr-2"
                >
                  Vsi toni
                </button>
                <span className={`relative flex items-center gap-1 border-l pl-2 pr-2.5 ${allNotes ? "border-white/25" : "border-neutral-200 dark:border-white/[0.1]"}`}>
                  {allNotes && mark ? <span className="font-medium">{mark === "current" ? `trenutna: ${currentChord ?? "—"}` : mark}</span> : null}
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <select
                    value={allNotes ? mark : ""}
                    onChange={(e) => {
                      setMark(e.target.value);
                      onPos(-1);
                    }}
                    aria-label="Označi med vsemi toni"
                    title="Označi akord ali lestvico med vsemi toni"
                    className="absolute inset-0 cursor-pointer bg-[#16161b] text-neutral-100 opacity-0 [color-scheme:dark] [&_optgroup]:bg-[#16161b] [&_option]:bg-[#16161b] [&_option]:text-neutral-100"
                  >
                    <option value="">Brez označevanja</option>
                    {currentChord !== undefined && <option value="current">Trenutna: {currentChord ?? "— (predvajaj skladbo)"}</option>}
                    {uniqueSongChords.length > 0 && (
                      <optgroup label="Akordi skladbe">
                        {uniqueSongChords.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={`Glavni akordi (${NAMES[root]} ${minorish ? "mol" : "dur"})`}>
                      {keyChords.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Durovi akordi">
                      {NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Molovi akordi">
                      {NAMES.map((n) => (
                        <option key={n} value={`${n}m`}>
                          {n}m
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </span>
              </span>
              <button type="button" aria-pressed={pos === 0} onClick={() => onPos(0)} className={`${CHIP} ${pos === 0 ? CHIP_ON : CHIP_OFF}`}>
                Cel vrat
              </button>
              {positions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={pos === i + 1}
                  onClick={() => onPos(i + 1)}
                  className={`${CHIP} min-w-9 px-2.5 ${pos === i + 1 ? CHIP_ON : CHIP_OFF}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Na pikah">
            {!compact && <div className={LABEL}>Na pikah</div>}
            <div className="inline-flex rounded-full border border-neutral-200 p-0.5 dark:border-white/[0.08]">
              {(["note", "int"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={labels === v}
                  onClick={() => onLabels(v)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    labels === v ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.1] dark:text-white" : "text-neutral-500"
                  }`}
                >
                  {v === "note" ? "Note" : "Intervali"}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Prilagajanje" className="hidden lg:flex">
            <div className="flex items-center gap-2.5">
              {/* Blaga vijolična ločnica pred prilagoditvami vratu. */}
              <span aria-hidden="true" className="h-6 w-px bg-violet-400/40" />
              <button
                type="button"
                aria-pressed={splitPref}
                onClick={toggleSplit}
                title="Vrat v dveh vrsticah: prečke 1–9 zgoraj, 10–19 spodaj"
                className={`${CHIP} ${splitPref ? CHIP_ON : CHIP_OFF}`}
              >
                Prelomi vrat
              </button>
            </div>
          </div>
          <div className="lg:ml-auto">
            {!compact && <div className={LABEL}>Velikost</div>}
            <div className="inline-flex items-center rounded-full border border-neutral-200 p-0.5 dark:border-white/[0.08]" role="group" aria-label="Velikost vratu">
              <button
                type="button"
                onClick={() => setZoom(zoom - ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Manjši vrat"
                title="Manjši vrat"
                className="flex h-7 w-8 items-center justify-center rounded-full text-lg leading-none text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Privzeta velikost"
                className="w-11 text-center font-mono text-xs tabular-nums text-neutral-500"
              >
                {Math.round(zoom * 100)} %
              </button>
              <button
                type="button"
                onClick={() => setZoom(zoom + ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX}
                aria-label="Večji vrat"
                title="Večji vrat"
                className="flex h-7 w-8 items-center justify-center rounded-full text-lg leading-none text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={playScale}
            aria-label={playing ? "Ustavi" : "Zaigraj lestvico"}
            title={playing ? "Ustavi" : "Zaigraj lestvico"}
            className={`inline-flex items-center gap-2 rounded-full bg-neutral-900 text-sm ${compact ? "h-8 w-8 justify-center" : "px-4 py-2"} font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`}
          >
            {playing ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M7 4v16l13-8z" />
              </svg>
            )}
            {!compact && (playing ? "Ustavi" : "Zaigraj lestvico")}
          </button>
        </div>
      </div>

      <div className={`flex flex-wrap gap-x-5 gap-y-1 px-4 text-sm text-neutral-500 ${compact ? "items-center pt-2" : "pt-3"}`}>
        {!compact && (
        <span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {NAMES[root]} {sc.name.toLowerCase()}
          </span>
          {" · "}
          {active ? `položaj ${pos} · prečke ${active.start}–${active.end}` : allNotes ? "vsi toni" : "cel vrat"}
        </span>
        )}
        <span className="font-mono text-xs leading-5">{allInts.map((iv) => NAMES[mod12(root + iv)]).join(" ")}</span>
        <span className="font-mono text-xs leading-5">{allInts.map((iv) => intLabel(iv, sc)).join(" ")}</span>
      </div>
      <div className={`flex flex-wrap gap-x-4 gap-y-1 px-4 text-xs text-neutral-500 ${compact ? "pt-1" : "pt-2"}`}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500 dark:bg-orange-400" />
          osnovni ton
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-800 dark:bg-neutral-200" />
          ton lestvice
        </span>
        {sc.extra && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 dark:bg-sky-400" />
            blue nota
          </span>
        )}
        <span>· tapni piko za zvok</span>
      </div>

      <div ref={neckRef} className={`overflow-x-auto px-4 pb-5 ${compact ? "pt-2" : "pt-3"}`}>
        {(split
          ? [
              [0, PAD + fretD(SPLIT_FRET) + 6],
              [PAD + fretD(SPLIT_FRET) - 12, W],
            ]
          : [[0, W]]
        ).map(([x0, x1], row) => (
          <svg
            key={row}
            width={(x1 - x0) * zoom}
            height={H * zoom}
            viewBox={`${x0} 0 ${x1 - x0} ${H}`}
            role="img"
            aria-label={split ? `Vrat kitare, prečke ${row ? `${SPLIT_FRET + 1}–${FRETS}` : `0–${SPLIT_FRET}`}` : "Vrat kitare z označeno lestvico"}
            className={`block ${split ? "" : "mx-auto"} ${row ? "mt-2" : ""}`}
          >
            <rect x={board.x} y={board.y} width={board.w} height={board.h} rx={6} className="fill-[#efe7dc] dark:fill-[#17161a]" />
            {INLAYS.map((f) => {
              const d = NUT + (f - 0.5) * FW;
              const [lx, ly] = desktop ? [PAD + d, H - 6] : [PAD - 16, PAD + d];
              return (
                <g key={f}>
                  {(f === 12 ? [1.5, 3.5] : [2.5]).map((off) => {
                    const [x, y] = at(off, d);
                    return <circle key={off} cx={x} cy={y} r={5} className="fill-[#c9c2b8] dark:fill-[#3a3840]" />;
                  })}
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-neutral-500 font-mono text-[10px]">
                    {f}
                  </text>
                </g>
              );
            })}
            {Array.from({ length: FRETS + 1 }, (_, f) => {
              const [x1, y1] = at(0, fretD(f));
              const [x2, y2] = at(5, fretD(f));
              return (
                <line
                  key={f}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={f === 0 ? 4 : 1.5}
                  className={f === 0 ? "stroke-neutral-900 dark:stroke-neutral-200" : "stroke-[#c9c2b8] dark:stroke-[#3a3840]"}
                />
              );
            })}
            {OPEN.map((_, s) => {
              const [x1, y1] = at(s, 0);
              const [x2, y2] = at(s, len);
              return <line key={s} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1 + (5 - s) * 0.3} className="stroke-[#9a948c] dark:stroke-[#5b5862]" />;
            })}
            {dots}
            {split && (
              <text
                x={PAD + NUT + (SPLIT_FRET + 0.5) * FW}
                y={H - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-neutral-500 font-mono text-[10px]"
              >
                {SPLIT_FRET + 1}
              </text>
            )}
          </svg>
        ))}
      </div>
    </>
  );
}
