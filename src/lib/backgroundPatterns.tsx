// Vzorci ozadja aplikacije (⋮ → Nastavitve → Tema → Vzorec): tanke črte,
// statične, narisane v SVG (ostre na vsakem zaslonu, brez slik). Vidni samo v
// temni temi — izriše jih ThemeProvider za vso vsebino.

import { useEffect, useRef, useState } from "react";

export const PATTERNS = [
  { id: "topo", label: "Plastnice" },
  { id: "fretboard", label: "Vrat kitare" },
  { id: "speaker", label: "Zvočnik" },
  { id: "chord", label: "Akordni diagram" },
] as const;

export type PatternId = (typeof PATTERNS)[number]["id"];

export const DEFAULT_PATTERN: PatternId = "fretboard";

export function isPatternId(v: unknown): v is PatternId {
  return PATTERNS.some((p) => p.id === v);
}

const W = 1440;
const H = 900;

// inlay = barva pik na prečkah vratu kitare (privzeto accent).
type Colors = { line: string; accent: string; inlay?: string };

// Ozadje: zelo temne črte (3 % bele) z redkimi smaragdnimi poudarki.
export const BACKGROUND_COLORS: Colors = { line: "rgba(255,255,255,0.03)", accent: "rgba(52,211,153,0.08)", inlay: "rgba(255,255,255,0.11)" };

// Vidnost vzorca (⋮ → Nastavitve → Tema → drsnik): k = 0 … 6, 1 = privzeto.
// Pomnoži prosojnost barv (nad 1 so črte izrazitejše, ne le manj prosojne).
export const PATTERN_OPACITY_MAX = 6;
export function scaledBackgroundColors(k: number, base: Colors = BACKGROUND_COLORS): Colors {
  const scale = (c: string) => c.replace(/([\d.]+)\)$/, (_, a: string) => `${Math.min(1, Number(a) * k).toFixed(3)})`);
  return { line: scale(base.line), accent: scale(base.accent), inlay: scale(base.inlay ?? base.accent) };
}
// Svetla tema: temne črte na svetlem ozadju (nekoliko močnejše, svetlo ozadje jih "poje").
export const LIGHT_BACKGROUND_COLORS: Colors = { line: "rgba(24,24,32,0.045)", accent: "rgba(16,185,129,0.14)", inlay: "rgba(24,24,32,0.12)" };

// Na ozkem (pokončnem) zaslonu se vidi samo del širine; poravnava pove, kateri
// del — pri zvočniku in diagramu desni, kjer sta narisana.
const ALIGN: Record<PatternId, string> = {
  topo: "xMidYMid slice",
  fretboard: "xMinYMid slice",
  speaker: "xMaxYMid slice",
  chord: "xMaxYMid slice",
};

export function PatternSvg({ id, colors, className }: { id: PatternId; colors: Colors; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={ALIGN[id]} className={className}>
      <g fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {id === "topo" && <Topo {...colors} />}
        {id === "fretboard" && <Fretboard {...colors} />}
        {id === "speaker" && <Speaker {...colors} />}
        {id === "chord" && <ChordDiagram {...colors} />}
      </g>
    </svg>
  );
}

const pt = (x: number, y: number, first: boolean) => `${first ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
const seg = (a: [number, number], b: [number, number]) => `${pt(a[0], a[1], true)}${pt(b[0], b[1], false)}`;

// Plastnice (kot zemljevid).
export function topoRing(cx: number, cy: number, r: number, seed: number) {
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(3 * a + seed) + 0.08 * Math.sin(5 * a + seed * 2.3) + 0.04 * Math.sin(9 * a + seed * 0.7);
    d += pt(cx + Math.cos(a) * r * k * 1.25, cy + Math.sin(a) * r * k, i === 0);
  }
  return d + "Z";
}
function Topo({ line, accent }: Colors) {
  const centers = [
    { cx: 1150, cy: 180, n: 14, seed: 1.2 },
    { cx: 250, cy: 720, n: 12, seed: 3.4 },
    { cx: 700, cy: 470, n: 6, seed: 5.1 },
  ];
  return (
    <>
      {centers.flatMap((c, ci) =>
        Array.from({ length: c.n }, (_, i) => (
          <path key={`${ci}-${i}`} d={topoRing(c.cx, c.cy, 22 + i * 28, c.seed + i * 0.18)} stroke={i % 5 === 4 ? accent : line} />
        )),
      )}
    </>
  );
}

// Vrat kitare v perspektivi: 6 strun se zbliža proti desni, prečke se gostijo
// kot na pravi kitari (12. koren iz 2), piki na 3., 5., 7. … prečki.
// Višina strune i na x (vrat kitare v perspektivi) — skupno za vzorec in svetlobo.
function fretStringY(i: number, x: number) {
  const t = Math.min(1, Math.max(0, (x + 80) / (W + 160)));
  const spread = 520 - 300 * t;
  return H * 0.62 - spread / 2 + (spread / 5) * i - 120 * t;
}

// Položaj n-te prečke (0 = sedlo) na vratu kitare.
const fretX = (n: number) => -80 + (W + 300) * (1 - Math.pow(2, -n / 12)) * 1.3;

function Fretboard({ line, accent, inlay }: Colors) {
  const fx = fretX;
  const sy = fretStringY;
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <path key={`s${i}`} d={seg([-80, sy(i, -80)], [W + 80, sy(i, W + 80)])} stroke={i === 2 ? accent : line} />
      ))}
      {Array.from({ length: 18 }, (_, n) => {
        const x = fx(n);
        return <path key={`f${n}`} d={seg([x, sy(0, x) - 14], [x, sy(5, x) + 14])} stroke={line} />;
      })}
      {[3, 5, 7, 9, 12, 15, 17].map((n) => {
        const x = (fx(n - 1) + fx(n)) / 2;
        // Pike: sive in prosojne (obris), malo večje in svetlejše od strun, da so vidne.
        return <circle key={`d${n}`} cx={x} cy={(sy(2, x) + sy(3, x)) / 2} r={5.5} stroke={inlay ?? accent} />;
      })}
    </>
  );
}

// Zvočnik: ohišje z dvema membranama (obroba, stožec, kapica) in vijaki.
function Speaker({ line, accent }: Colors) {
  const cones = [
    { cx: 1130, cy: 300, r: 210 },
    { cx: 1130, cy: 720, r: 150 },
  ];
  return (
    <>
      <rect x={870} y={40} width={520} height={900} rx={28} stroke={line} />
      <rect x={890} y={60} width={480} height={860} rx={20} stroke={line} />
      {cones.map((c, ci) => (
        <g key={ci}>
          {[1, 0.94, 0.86].map((k, i) => (
            <circle key={`o${i}`} cx={c.cx} cy={c.cy} r={c.r * k} stroke={i === 1 ? accent : line} />
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r * (0.78 - i * 0.08)} stroke={line} />
          ))}
          <circle cx={c.cx} cy={c.cy} r={c.r * 0.2} stroke={accent} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            return <circle key={`v${i}`} cx={c.cx + Math.cos(a) * c.r * 1.08} cy={c.cy + Math.sin(a) * c.r * 1.08} r={4} stroke={line} />;
          })}
        </g>
      ))}
    </>
  );
}

// Akordni diagram: velik G-dur (desno) in manjši Am (levo spodaj), rahlo
// zasukana — strune, prečke, piki za prste, o / x nad vrhnjim pragom.
function ChordGrid({
  x,
  y,
  s,
  rot,
  dots,
  marks,
  line,
  accent,
}: { x: number; y: number; s: number; rot: number; dots: [number, number][]; marks: string } & Colors) {
  const sw = s / 5;
  const fh = s / 4;
  return (
    <g transform={`rotate(${rot} ${x + s / 2} ${y + s / 2})`}>
      {Array.from({ length: 6 }, (_, i) => (
        <path key={`s${i}`} d={seg([x + i * sw, y], [x + i * sw, y + 5 * fh])} stroke={line} />
      ))}
      {Array.from({ length: 6 }, (_, j) => (
        <path key={`f${j}`} d={seg([x, y + j * fh], [x + s, y + j * fh])} stroke={line} />
      ))}
      <path d={seg([x, y - 6], [x + s, y - 6])} stroke={line} />
      {dots.map(([str, fret], k) => (
        <circle key={`d${k}`} cx={x + str * sw} cy={y + (fret - 0.5) * fh} r={sw * 0.28} stroke={accent} />
      ))}
      {marks.split("").map((m, i) =>
        m === "o" ? (
          <circle key={`m${i}`} cx={x + i * sw} cy={y - 30} r={sw * 0.16} stroke={line} />
        ) : m === "x" ? (
          <g key={`m${i}`} stroke={line}>
            <path d={seg([x + i * sw - 8, y - 38], [x + i * sw + 8, y - 22])} />
            <path d={seg([x + i * sw + 8, y - 38], [x + i * sw - 8, y - 22])} />
          </g>
        ) : null,
      )}
    </g>
  );
}
function ChordDiagram(colors: Colors) {
  return (
    <>
      <ChordGrid x={860} y={140} s={460} rot={-10} dots={[[0, 3], [1, 2], [5, 3]]} marks="--ooo-" {...colors} />
      <ChordGrid x={120} y={560} s={240} rot={8} dots={[[3, 2], [2, 2], [4, 1]]} marks="xo---o" {...colors} />
    </>
  );
}

// "Zaigrane note" na vzorcu Vrat kitare: vsakih nekaj sekund (naključno 2,5–6 s)
// se na naključnem polju (med dvema prečkama, na struni) mehko prižge in
// ugasne blag krogec (.fret-note v globals.css, 3,6 s). Občasno dva hkrati, kot
// dvoglasje. Ob prefers-reduced-motion in v skritem zavihku nič ne nastaja.
const NOTE_LIFE_MS = 3600;
type FretNote = { id: number; x: number; y: number };

export function FretNotes({ className }: { className?: string }) {
  const [notes, setNotes] = useState<FretNote[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const spawn = () => {
      const fret = 1 + Math.floor(Math.random() * 14);
      const x = (fretX(fret - 1) + fretX(fret)) / 2;
      if (x < 40 || x > W - 40) return;
      const string = Math.floor(Math.random() * 6);
      const note = { id: ++idRef.current, x, y: fretStringY(string, x) };
      setNotes((prev) => [...prev, note]);
      later(() => setNotes((prev) => prev.filter((n) => n.id !== note.id)), NOTE_LIFE_MS);
    };
    const tick = () => {
      if (!document.hidden) {
        spawn();
        if (Math.random() < 0.25) later(spawn, 180 + Math.random() * 260);
      }
      later(tick, 2500 + Math.random() * 3500);
    };
    later(tick, 1200);
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={ALIGN.fretboard} className={className}>
      <defs>
        <radialGradient id="fret-note-glow">
          <stop offset="0" stopColor="rgb(52 211 153)" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="rgb(52 211 153)" stopOpacity="0.18" />
          <stop offset="1" stopColor="rgb(52 211 153)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {notes.map((n) => (
        <g key={n.id} className="fret-note" style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
          <circle cx={n.x} cy={n.y} r={34} fill="url(#fret-note-glow)" />
          <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}
