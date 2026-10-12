"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Lestvice (kartica na domači strani desno od Tunerja): vrat kitare v
// standardni uglasitvi z označeno lestvico — ton, lestvica, položaj (boks),
// note ali intervali na pikah. Tap na piko zaigra noto (Karplus-Strong),
// "Zaigraj lestvico" zaigra položaj gor in dol. Računalnik: vrat vodoravno
// (visoka e zgoraj kot v tabu), telefon: navpično (strune v stolpcih).

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const INTERVALS: Record<number, string> = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
// E2 A2 D3 G3 B3 E4 (MIDI), od nizke E navzgor.
const OPEN = [40, 45, 50, 55, 59, 64];
const FRETS = 17;
const INLAYS = [3, 5, 7, 9, 12, 15, 17];

type Scale = {
  id: string;
  name: string;
  // Toni, iz katerih se gradijo položaji (nps tonov na struno).
  base: number[];
  // Dodatni toni (blue nota), dodani znotraj razpona boksa na vsaki struni.
  extra?: number[];
  nps: number;
  sharp4?: boolean;
};

const SCALES: Scale[] = [
  { id: "minpent", name: "Mol pentatonika", base: [0, 3, 5, 7, 10], nps: 2 },
  { id: "majpent", name: "Dur pentatonika", base: [0, 2, 4, 7, 9], nps: 2 },
  { id: "blues", name: "Blues", base: [0, 3, 5, 7, 10], extra: [6], nps: 2 },
  { id: "major", name: "Dur (jonska)", base: [0, 2, 4, 5, 7, 9, 11], nps: 3 },
  { id: "minor", name: "Naravni mol", base: [0, 2, 3, 5, 7, 8, 10], nps: 3 },
  { id: "harm", name: "Harmonični mol", base: [0, 2, 3, 5, 7, 8, 11], nps: 3 },
  { id: "dorian", name: "Dorska", base: [0, 2, 3, 5, 7, 9, 10], nps: 3 },
  { id: "mixo", name: "Miksolidijska", base: [0, 2, 4, 5, 7, 9, 10], nps: 3 },
  { id: "phryg", name: "Frigijska", base: [0, 1, 3, 5, 7, 8, 10], nps: 3 },
  { id: "lyd", name: "Lidijska", base: [0, 2, 4, 6, 7, 9, 11], nps: 3, sharp4: true },
];

const KEY = "komadi:scales";

type Cell = [string: number, fret: number];
type Position = { k: number; start: number; end: number; cells: Cell[] };

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const intLabel = (iv: number, sc: Scale) => (iv === 6 && sc.sharp4 ? "#4" : INTERVALS[iv]);

// Položaj k: začni na nizki E pri k-ti stopnji osnove, na vsaki struni vzemi
// `nps` zaporednih tonov lestvice in nadaljuj na naslednji struni s prvim
// višjim tonom — da klasične pentatonične bokse (2 na struno) in 3-na-struno
// položaje 7-tonskih lestvic. Razvrščeni po prečki, a številčenje začne pri
// položaju z osnovnim tonom na nizki E (kot "boks 1" pri pentatoniki).
function positionsOf(root: number, sc: Scale): Position[] {
  const out: Position[] = [];
  for (let k = 0; k < sc.base.length; k++) {
    let f0 = 0;
    while (mod12(OPEN[0] + f0 - root) !== sc.base[k]) f0++;
    let p = OPEN[0] + f0;
    const cells: Cell[] = [];
    for (let s = 0; s < 6; s++) {
      let taken = 0;
      while (taken < sc.nps) {
        if (p - OPEN[s] >= 0 && sc.base.includes(mod12(p - root))) {
          cells.push([s, p - OPEN[s]]);
          taken++;
        }
        p++;
      }
    }
    if (sc.extra) {
      for (let s = 0; s < 6; s++) {
        const frets = cells.filter((c) => c[0] === s).map((c) => c[1]);
        for (let f = Math.min(...frets); f <= Math.max(...frets); f++) {
          if (sc.extra.includes(mod12(OPEN[s] + f - root))) cells.push([s, f]);
        }
      }
    }
    const frets = cells.map((c) => c[1]);
    if (Math.max(...frets) <= FRETS) out.push({ k, start: Math.min(...frets), end: Math.max(...frets), cells });
  }
  out.sort((a, b) => a.start - b.start);
  const first = Math.max(0, out.findIndex((p) => p.k === 0));
  return [...out.slice(first), ...out.slice(0, first)];
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
        pos: Number.isInteger(v.pos) && v.pos >= 0 ? v.pos : DEFAULTS.pos,
        labels: v.labels === "int" ? "int" : "note",
      };
    }
  } catch {}
  return DEFAULTS;
}

const LG = "(min-width: 1024px)";
function useIsDesktop() {
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

export default function Scales({ onClose }: { onClose: () => void }) {
  useBackableOpen(true, onClose);
  const desktop = useIsDesktop();
  const [state, setState] = useState<Stored>(readStored);
  const [playing, setPlaying] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neckRef = useRef<HTMLDivElement>(null);

  const sc = SCALES.find((s) => s.id === state.scale) ?? SCALES[0];
  const positions = positionsOf(state.root, sc);
  const pos = state.pos > positions.length ? 0 : state.pos;
  const active = pos ? positions[pos - 1] : null;
  const activeSet = active ? new Set(active.cells.map((c) => `${c[0]},${c[1]}`)) : null;
  const allInts = [...sc.base, ...(sc.extra ?? [])].sort((a, b) => a - b);

  function update(patch: Partial<Stored>) {
    stopPlaying();
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

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
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
    if (!el || activeStart == null || !desktop) return;
    el.scrollTo({ left: Math.max(0, PAD + NUT + activeStart * FW - 80), behavior: "smooth" });
  }, [activeStart, desktop, FW]);

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
      const iv = mod12(midi - state.root);
      if (!allInts.includes(iv)) continue;
      const key = `${s},${f}`;
      const isRoot = iv === 0;
      const isBlue = (sc.extra ?? []).includes(iv);
      const [x, y] = at(s, noteD(f));
      const dim = activeSet != null && !activeSet.has(key);
      dots.push(
        <g
          key={key}
          onClick={() => pluck(midi)}
          className={`cursor-pointer transition-opacity ${dim ? "opacity-[0.18]" : ""}`}
        >
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
            {state.labels === "note" ? NAMES[midi % 12] : intLabel(iv, sc)}
          </text>
        </g>,
      );
    }
  }

  const board = desktop ? { x: PAD + NUT, y: PAD - 8, w: FRETS * FW, h: wid + 16 } : { x: PAD - 8, y: PAD + NUT, w: wid + 16, h: FRETS * FW };

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
        <button
          type="button"
          onClick={onClose}
          aria-label="Zapri"
          title="Zapri"
          className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-neutral-200"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3.5 dark:border-white/[0.08]">
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
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="min-w-0">
              <div className={LABEL}>Položaj</div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                <button type="button" aria-pressed={pos === 0} onClick={() => update({ pos: 0 })} className={`${CHIP} ${pos === 0 ? CHIP_ON : CHIP_OFF}`}>
                  Cel vrat
                </button>
                {positions.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={pos === i + 1}
                    onClick={() => update({ pos: i + 1 })}
                    className={`${CHIP} min-w-9 px-2.5 ${pos === i + 1 ? CHIP_ON : CHIP_OFF}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={LABEL}>Na pikah</div>
              <div className="inline-flex rounded-full border border-neutral-200 p-0.5 dark:border-white/[0.08]">
                {(["note", "int"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={state.labels === v}
                    onClick={() => update({ labels: v })}
                    className={`rounded-full px-3 py-1 text-sm transition ${
                      state.labels === v ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.1] dark:text-white" : "text-neutral-500"
                    }`}
                  >
                    {v === "note" ? "Note" : "Intervali"}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={playScale}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 lg:ml-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
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
              {playing ? "Ustavi" : "Zaigraj lestvico"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 pt-3 text-sm text-neutral-500">
          <span>
            <span className="font-medium text-neutral-900 dark:text-white">
              {NAMES[state.root]} {sc.name.toLowerCase()}
            </span>
            {" · "}
            {active ? `položaj ${pos} · prečke ${active.start}–${active.end}` : "cel vrat"}
          </span>
          <span className="font-mono text-xs leading-5">{allInts.map((iv) => NAMES[mod12(state.root + iv)]).join(" ")}</span>
          <span className="font-mono text-xs leading-5">{allInts.map((iv) => intLabel(iv, sc)).join(" ")}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-xs text-neutral-500">
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

        <div ref={neckRef} className="overflow-x-auto px-4 pt-3 pb-5">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vrat kitare z označeno lestvico" className="mx-auto block">
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
          </svg>
        </div>
      </div>
    </div>,
    document.body,
  );
}
