"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChordDiagram from "@/components/ChordDiagram";
import { CLOSE_BUTTON, CLOSE_ICON } from "@/components/Scales";
import {
  CHORD_ROOTS,
  CHORD_TYPES,
  LESSONS,
  LESSON_CHORD_NAMES,
  STRUM_PATTERNS,
  lessonChord,
  lessonShape,
  type LessonChord,
  type Stroke,
} from "@/lib/beginnerChords";
import { findChordShapes, loadChordDb, type ChordPosition } from "@/lib/chordShapes";
import { parseChords, simplifyChord, splitDescription } from "@/lib/chords";
import { openChordsViewer, useOpenChordsSongId } from "@/lib/openChords";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { useAudio, useTicker, type AudioApi } from "@/lib/useStrumAudio";
import type { Song } from "@/types/song";

// "Za začetnike" (gumb levo od iskanja): celozaslonska stran z zavihki —
// lekcije začetnih akordov po vrsti (s kljukico "Znam"), vsi akordi iz
// chords-db, vaja menjav akordov (z metronomom in minutna), brenkalni vzorci v
// tempu (Web Audio, Karplus-Strong brenkanje akorda) in skladbe iz knjižnice,
// ki jih lahko zaigraš samo z znanimi akordi.

type Tab = "lessons" | "all" | "changes" | "strum" | "songs";
const TABS: { id: Tab; label: string }[] = [
  { id: "lessons", label: "Začetni akordi" },
  { id: "all", label: "Vsi akordi" },
  { id: "changes", label: "Menjave" },
  { id: "strum", label: "Brenkanje" },
  { id: "songs", label: "Prve skladbe" },
];
const TAB_KEY = "komadi:beginner:tab";
const KNOWN_KEY = "komadi:beginner:known";
const CHANGES_KEY = "komadi:beginner:changes";
// Skupno s pregledovalnikom akordov (izbrana lega prijema po imenu akorda).
const SHAPE_CHOICE_KEY = "komadi:chords:shapeChoice";

const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition";
const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white dark:border-white/20 dark:bg-white/[0.14] dark:text-white";
const CHIP_OFF =
  "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.06]";
const LABEL = "mb-1.5 text-[11px] uppercase tracking-[0.06em] text-neutral-500";
const CARD = "rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.03]";
const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[0.06]";
const BTN_MAIN =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-500";

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ---------- Skupni gradniki ----------

function Diagram({ name, shape, size = "w-28" }: { name: string; shape: ChordPosition; size?: string }) {
  return (
    <div className={`[&_svg]:h-auto ${size === "w-28" ? "[&_svg]:w-28" : size === "w-36" ? "[&_svg]:w-36" : "[&_svg]:w-24"}`}>
      <ChordDiagram name={name} position={shape} />
    </div>
  );
}

function KnownToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        on
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-white/15 dark:hover:bg-white/[0.06]"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Znam
    </button>
  );
}

function BpmControl({ bpm, setBpm, min = 40, max = 160 }: { bpm: number; setBpm: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={BTN + " px-3!"} onClick={() => setBpm(Math.max(min, bpm - 5))} aria-label="Počasneje">
        −
      </button>
      <span className="w-20 text-center text-sm tabular-nums">{bpm} BPM</span>
      <button type="button" className={BTN + " px-3!"} onClick={() => setBpm(Math.min(max, bpm + 5))} aria-label="Hitreje">
        +
      </button>
    </div>
  );
}

function ChordPicker({ value, onChange, known }: { value: string; onChange: (v: string) => void; known: Set<string> }) {
  // Znani akordi najprej.
  const names = [...LESSON_CHORD_NAMES].sort((a, b) => Number(known.has(b)) - Number(known.has(a)));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
      {names.map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={n === value} className={`${CHIP} ${n === value ? CHIP_ON : CHIP_OFF}`}>
          {n}
          {known.has(n) && <span className="ml-1 text-emerald-500">•</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Glavna komponenta ----------

export default function Beginners({ onClose, songs }: { onClose: () => void; songs: Song[] }) {
  useBackableOpen(true, onClose);
  const [tab, setTabState] = useState<Tab>(() => {
    const t = readJson<string>(TAB_KEY, "lessons");
    return TABS.some((x) => x.id === t) ? (t as Tab) : "lessons";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    writeJson(TAB_KEY, t);
  };
  const [known, setKnown] = useState<Set<string>>(() => new Set(readJson<string[]>(KNOWN_KEY, [])));
  const toggleKnown = (name: string) =>
    setKnown((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeJson(KNOWN_KEY, [...next]);
      return next;
    });
  const audio = useAudio();
  // Odprt pregledovalnik akordov (iz "Prve skladbe") je nad to stranjo — Escape ji ne pripada.
  const chordsOpen = useOpenChordsSongId() !== null;

  useEffect(() => {
    if (chordsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, chordsOpen]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-view-portal
      className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900 [--cv-bg:#ffffff] [--cv-chord:#c2410c] [--cv-muted:#a3a3a3] [--cv-text:#262626] dark:bg-[#0d0d10] dark:text-neutral-100 dark:[--cv-bg:#0d0d10] dark:[--cv-chord:#fb923c] dark:[--cv-muted:#525252] dark:[--cv-text:#e5e5e5]"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-sky-500 dark:text-sky-400">
          <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
          <path d="M22 10v6" />
          <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
        </svg>
        <h2 className="flex-1 text-base font-semibold">Za začetnike</h2>
        <button type="button" onClick={onClose} aria-label="Zapri" title="Zapri" className={CLOSE_BUTTON}>
          {CLOSE_ICON}
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-200 px-4 py-2.5 [scrollbar-width:thin] dark:border-white/[0.08]">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`${CHIP} ${tab === t.id ? CHIP_ON : CHIP_OFF}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-4">
          {tab === "lessons" && <Lessons known={known} toggleKnown={toggleKnown} />}
          {tab === "all" && <AllChords known={known} toggleKnown={toggleKnown} />}
          {tab === "changes" && <Changes known={known} audio={audio} />}
          {tab === "strum" && <Strumming known={known} audio={audio} />}
          {tab === "songs" && <FirstSongs known={known} toggleKnown={toggleKnown} songs={songs} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Začetni akordi ----------

function Lessons({ known, toggleKnown }: { known: Set<string>; toggleKnown: (n: string) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className={`${CARD} text-sm leading-relaxed text-neutral-600 dark:text-neutral-300`}>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-white">Kako brati shemo</div>
        Navpične črte so strune — levo debela E, desno tanka e. Vodoravne so pragovi, debela črta zgoraj je zgornji rob vratu.
        Številka na piki je prst: 1 kazalec, 2 sredinec, 3 prstanec, 4 mezinec. ○ = struna zveni prazna, × = te strune ne brenkaš.
        Prst postavi tik za prečko (proti telu kitare), ne nanjo.
      </div>
      {LESSONS.map((lesson, li) => {
        const done = lesson.chords.filter((c) => known.has(c.name)).length;
        return (
          <section key={lesson.title}>
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="text-lg font-semibold">
                {li + 1}. {lesson.title}
              </h3>
              <span className={`text-xs tabular-nums ${done === lesson.chords.length ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}>
                {done}/{lesson.chords.length}
              </span>
            </div>
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">{lesson.intro}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lesson.chords.map((c) => (
                <LessonCard key={c.name + c.frets.join()} chord={c} known={known.has(c.name)} onToggle={() => toggleKnown(c.name)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LessonCard({ chord, known, onToggle }: { chord: LessonChord; known: boolean; onToggle: () => void }) {
  return (
    <div className={`${CARD} flex gap-3`}>
      <Diagram name={chord.name} shape={lessonShape(chord)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <p className="leading-snug">{chord.tip}</p>
        <p className="leading-snug text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-amber-600 dark:text-amber-400">Pogosta napaka: </span>
          {chord.mistake}
        </p>
        <div className="mt-auto">
          <KnownToggle on={known} onToggle={onToggle} />
        </div>
      </div>
    </div>
  );
}

// ---------- Vsi akordi ----------

type Db = Awaited<ReturnType<typeof loadChordDb>>;

function AllChords({ known, toggleKnown }: { known: Set<string>; toggleKnown: (n: string) => void }) {
  const [db, setDb] = useState<Db | null>(null);
  const [root, setRoot] = useState<string | null>("C");
  const [type, setType] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, number>>(() => readJson(SHAPE_CHOICE_KEY, {}));
  useEffect(() => {
    let alive = true;
    loadChordDb().then((d) => alive && setDb(d));
    return () => {
      alive = false;
    };
  }, []);
  const step = (name: string, count: number, delta: number) =>
    setChoice((prev) => {
      const next = { ...prev, [name]: ((prev[name] ?? 0) + delta + count) % count };
      writeJson(SHAPE_CHOICE_KEY, next);
      return next;
    });

  const roots = root ? [root] : CHORD_ROOTS;
  const types = type !== null ? CHORD_TYPES.filter((t) => t.suffix === type) : root ? CHORD_TYPES : CHORD_TYPES.slice(0, 2);
  const names = roots.flatMap((r) => types.map((t) => r + t.suffix));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className={LABEL}>Ton</div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          <button type="button" onClick={() => setRoot(null)} className={`${CHIP} ${root === null ? CHIP_ON : CHIP_OFF}`}>
            Vsi
          </button>
          {CHORD_ROOTS.map((r) => (
            <button key={r} type="button" onClick={() => setRoot(r)} className={`${CHIP} ${root === r ? CHIP_ON : CHIP_OFF}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className={LABEL}>Vrsta</div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          <button type="button" onClick={() => setType(null)} className={`${CHIP} ${type === null ? CHIP_ON : CHIP_OFF}`}>
            {root ? "Vse" : "Dur in mol"}
          </button>
          {CHORD_TYPES.map((t) => (
            <button key={t.suffix} type="button" onClick={() => setType(t.suffix)} className={`${CHIP} ${type === t.suffix ? CHIP_ON : CHIP_OFF}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {!db ? (
        <p className="py-8 text-center text-sm text-neutral-500">Nalagam akorde …</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {names.map((name) => {
            const positions = findChordShapes(db, name);
            if (!positions.length) return null;
            const i = Math.min(choice[name] ?? 0, positions.length - 1);
            return (
              <div key={name} className={`${CARD} flex flex-col items-center gap-2`}>
                <Diagram name={name} shape={positions[i]} size="w-24" />
                {positions.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <button type="button" onClick={() => step(name, positions.length, -1)} aria-label="Prejšnja lega" className="rounded-full px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
                      ‹
                    </button>
                    <span className="tabular-nums">
                      {i + 1}/{positions.length}
                    </span>
                    <button type="button" onClick={() => step(name, positions.length, 1)} aria-label="Naslednja lega" className="rounded-full px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
                      ›
                    </button>
                  </div>
                )}
                <KnownToggle on={known.has(name)} onToggle={() => toggleKnown(name)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Menjave ----------

function shapeOf(name: string): ChordPosition {
  const c = lessonChord(name);
  return c ? lessonShape(c) : { frets: [0, 0, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0], barres: [], baseFret: 1 };
}

function Changes({ known, audio }: { known: Set<string>; audio: AudioApi }) {
  const knownLesson = LESSON_CHORD_NAMES.filter((n) => known.has(n));
  // 2–4 akordi, menjajo se po vrsti (zadnji → spet prvi).
  const [picked, setPicked] = useState<string[]>(() => {
    const pool = [...knownLesson, "Em", "Am", "C", "G"].filter((n, i, arr) => arr.indexOf(n) === i);
    return pool.slice(0, 4);
  });
  const [size, setSize] = useState(2);
  const list = picked.slice(0, size);
  const setAt = (i: number, name: string) => setPicked((prev) => prev.map((n, j) => (j === i ? name : n)));
  const [bpm, setBpm] = useState(60);
  const [beats, setBeats] = useState(4);
  const [on, setOn] = useState(false);
  const [sound, setSound] = useState(true);
  const beat = useTicker(audio, on, bpm, 1, (s, at) => {
    audio.click(at, s % beats === 0);
    if (sound && s % beats === 0) audio.strum(at, shapeOf(list[Math.floor(s / beats) % list.length]), false, 0.16);
  });
  const ci = beat < 0 ? 0 : Math.floor(beat / beats) % list.length;
  const current = list[ci];
  const next = list[(ci + 1) % list.length];

  // Minutna vaja: čim več čistih menjav v 60 s, štej sam.
  const [records, setRecords] = useState<Record<string, number>>(() => readJson(CHANGES_KEY, {}));
  // Par: vrstni red ni pomemben; 3–4 akordi: zaporedje.
  const pairKey = size === 2 ? [...list].sort().join(" ↔ ") : list.join(" → ");
  const [left, setLeft] = useState<number | null>(null);
  const [count, setCount] = useState("");
  const endRef = useRef(0);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const id = window.setInterval(() => {
      const l = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        const c = audio.ctx();
        if (c) audio.click(c.currentTime + 0.02, true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [left, audio]);
  const startMinute = () => {
    setOn(false);
    const c = audio.ctx();
    if (c) audio.click(c.currentTime + 0.02, true);
    endRef.current = Date.now() + 60_000;
    setCount("");
    setLeft(60);
  };
  const saveCount = () => {
    const n = Math.round(Number(count));
    if (!Number.isFinite(n) || n <= 0) return;
    setRecords((prev) => {
      const next = { ...prev, [pairKey]: Math.max(prev[pairKey] ?? 0, n) };
      writeJson(CHANGES_KEY, next);
      return next;
    });
    setLeft(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Najtežje pri začetku ni prijem, ampak hitra menjava med akordi. Začni z dvema — počasi in čisto, nato pospeši; ko gre, dodaj tretjega
        in četrtega (npr. G → Em → C → D).
      </p>
      <div className="flex gap-1.5">
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" onClick={() => setSize(n)} aria-pressed={size === n} className={`${CHIP} ${size === n ? CHIP_ON : CHIP_OFF}`}>
            {n} akordi
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((name, i) => (
          <div key={i}>
            <div className={LABEL}>{["Prvi", "Drugi", "Tretji", "Četrti"][i]} akord</div>
            <ChordPicker value={name} onChange={(v) => setAt(i, v)} known={known} />
          </div>
        ))}
      </div>

      <section className={CARD}>
        <h3 className="mb-2 font-semibold">Z metronomom</h3>
        <div className="flex flex-wrap items-end justify-center gap-6 py-2">
          <div className="flex flex-col items-center">
            <span className={LABEL}>Zdaj</span>
            <Diagram name={current} shape={shapeOf(current)} size="w-36" />
          </div>
          <div className="flex flex-col items-center opacity-50">
            <span className={LABEL}>Naslednji</span>
            <Diagram name={next} shape={shapeOf(next)} size="w-24" />
          </div>
        </div>
        {size > 2 && (
          <div className="mb-2 flex justify-center gap-2 font-mono text-sm">
            {list.map((n, i) => (
              <span key={i} className={i === ci && beat >= 0 ? "font-bold text-sky-600 dark:text-sky-300" : "text-neutral-400"}>
                {n}
              </span>
            ))}
          </div>
        )}
        <div className="mb-3 flex justify-center gap-1.5">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${beat >= 0 && beat % beats === i ? "bg-sky-500" : "bg-neutral-300 dark:bg-white/15"}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <BpmControl bpm={bpm} setBpm={setBpm} />
          <div className="flex gap-1.5">
            {[4, 2].map((n) => (
              <button key={n} type="button" onClick={() => setBeats(n)} className={`${CHIP} ${beats === n ? CHIP_ON : CHIP_OFF}`}>
                {n === 4 ? "Menjava vsak takt" : "Vsaki 2 dobi"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Zaigraj akord
          </label>
          <button
            type="button"
            className={BTN_MAIN}
            onClick={() => {
              audio.ctx();
              setLeft(null);
              setOn(!on);
            }}
          >
            {on ? "Ustavi" : "Začni"}
          </button>
        </div>
      </section>

      <section className={CARD}>
        <h3 className="mb-1 font-semibold">Minutna vaja</h3>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          60 sekund menjavaj {size === 2 ? `${list[0]} in ${list[1]}` : list.join(" → ")} čim hitreje in štej, kolikokrat ti je uspelo čisto (vsaka
          zamenjava = 1). Vsak dan poskusi preseči rekord.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {left === null ? (
            <button type="button" className={BTN_MAIN} onClick={startMinute}>
              Začni minuto
            </button>
          ) : left > 0 ? (
            <>
              <span className="text-3xl font-semibold tabular-nums">{left} s</span>
              <button type="button" className={BTN} onClick={() => setLeft(null)}>
                Prekliči
              </button>
            </>
          ) : (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCount()}
                placeholder="Število menjav"
                autoFocus
                className="w-36 rounded-full border border-neutral-300 bg-transparent px-4 py-2 text-sm dark:border-white/15"
              />
              <button type="button" className={BTN_MAIN} onClick={saveCount}>
                Shrani
              </button>
              <button type="button" className={BTN} onClick={() => setLeft(null)}>
                Prekliči
              </button>
            </>
          )}
          {records[pairKey] !== undefined && (
            <span className="text-sm text-neutral-500">
              Rekord {pairKey}: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{records[pairKey]}</span>
            </span>
          )}
        </div>
        {Object.keys(records).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-neutral-500">
            {Object.entries(records).map(([k, v]) => (
              <span key={k} className="rounded-full border border-neutral-200 px-2.5 py-1 dark:border-white/[0.08]">
                {k}: {v}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Brenkanje ----------

const COUNTS = ["1", "+", "2", "+", "3", "+", "4", "+"];

function StrokeIcon({ stroke }: { stroke: Stroke }) {
  if (!stroke) return <span className="h-7 w-7" />;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      {stroke === "D" ? <path d="M12 5v14M19 12l-7 7-7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
    </svg>
  );
}

function Strumming({ known, audio }: { known: Set<string>; audio: AudioApi }) {
  const [pi, setPi] = useState(0);
  const [bpm, setBpm] = useState(70);
  const [on, setOn] = useState(false);
  const [chord, setChord] = useState(LESSON_CHORD_NAMES.find((n) => known.has(n)) ?? "G");
  const pattern = STRUM_PATTERNS[pi];
  const step = useTicker(audio, on, bpm, 2, (s, at) => {
    const i = s % 8;
    if (i % 2 === 0) audio.click(at, i === 0);
    const st = pattern.steps[i];
    if (st) {
      // Do naslednjega udarca v vzorcu (prazno mesto = roka zgreši strune, akord zveni naprej).
      let k = 1;
      while (k < 8 && !pattern.steps[(i + k) % 8]) k++;
      audio.strum(at, shapeOf(chord), st === "U", undefined, (k * 30) / Math.max(20, bpm));
    }
  });
  const cur = step < 0 ? -1 : step % 8;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Desna roka niha gor in dol enakomerno, ves čas — tudi kadar strun ne zadene. Tako ritem ostane stabilen. Začni počasi.
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        {STRUM_PATTERNS.map((p, i) => (
          <button key={p.name} type="button" onClick={() => setPi(i)} className={`${CHIP} ${i === pi ? CHIP_ON : CHIP_OFF}`}>
            {p.name}
          </button>
        ))}
      </div>
      <section className={CARD}>
        <p className="mb-4 text-sm">{pattern.hint}</p>
        <div className="mx-auto grid max-w-lg grid-cols-8 gap-1">
          {pattern.steps.map((st, i) => (
            <div
              key={i}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition-colors ${
                cur === i ? "bg-sky-500/15 text-sky-600 dark:text-sky-300" : st ? "" : "text-neutral-300 dark:text-white/20"
              }`}
            >
              <StrokeIcon stroke={st} />
              <span className={`text-xs tabular-nums ${i % 2 === 0 ? "font-semibold" : "text-neutral-400"}`}>{COUNTS[i]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <BpmControl bpm={bpm} setBpm={setBpm} min={40} max={140} />
          <button
            type="button"
            className={BTN_MAIN}
            onClick={() => {
              audio.ctx();
              setOn(!on);
            }}
          >
            {on ? "Ustavi" : "Začni"}
          </button>
        </div>
      </section>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className={LABEL}>Akord</div>
          <ChordPicker value={chord} onChange={setChord} known={known} />
        </div>
        <Diagram name={chord} shape={shapeOf(chord)} size="w-24" />
      </div>
    </div>
  );
}

// ---------- Prve skladbe ----------

// Ime akorda za primerjavo: brez zvezdic, H = B, po želji poenostavljeno (D7 → D).
function norm(name: string, simplify: boolean) {
  const n = name.replace(/\*+$/, "").replace(/^H/, "B").trim();
  return simplify ? simplifyChord(n) : n;
}

function songChords(text: string): string[] {
  const { body } = splitDescription(parseChords(text));
  const out = new Set<string>();
  for (const l of body) {
    if (l.kind === "pair") l.chunks.forEach((c) => c.chord && out.add(c.chord));
    else if (l.kind === "chords") l.chords.forEach((c) => out.add(c.name));
    else if (l.kind === "text") l.segments.forEach((s) => "chord" in s && out.add(s.chord));
    else if (l.kind === "tab") l.header?.forEach((c) => out.add(c.name));
  }
  return [...out].filter((n) => /^[A-H]/.test(n));
}

function FirstSongs({ known, toggleKnown, songs }: { known: Set<string>; toggleKnown: (n: string) => void; songs: Song[] }) {
  const [simplify, setSimplify] = useState(true);
  const parsed = useMemo(
    () => songs.filter((s) => s.chords_text).map((s) => ({ song: s, chords: songChords(s.chords_text as string) })),
    [songs],
  );
  const { ready, almost, unlock } = useMemo(() => {
    const k = new Set([...known].map((n) => norm(n, simplify)));
    const ready: { song: Song; chords: string[] }[] = [];
    const almost: { song: Song; chords: string[]; missing: string }[] = [];
    const unlock = new Map<string, number>();
    for (const p of parsed) {
      const chords = Array.from(new Set(p.chords.map((c) => norm(c, simplify))));
      if (!chords.length) continue;
      const missing = chords.filter((c) => !k.has(c));
      if (missing.length === 0) ready.push({ song: p.song, chords });
      else if (missing.length === 1) {
        almost.push({ song: p.song, chords, missing: missing[0] });
        unlock.set(missing[0], (unlock.get(missing[0]) ?? 0) + 1);
      }
    }
    ready.sort((a, b) => a.chords.length - b.chords.length);
    almost.sort((a, b) => (unlock.get(b.missing) ?? 0) - (unlock.get(a.missing) ?? 0) || a.chords.length - b.chords.length);
    return { ready, almost, unlock: [...unlock.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }, [parsed, known, simplify]);

  const row = (item: { song: Song; chords: string[]; missing?: string }) => (
    <button
      key={item.song.id}
      type="button"
      onClick={() => openChordsViewer(item.song.id)}
      className={`${CARD} flex w-full flex-col gap-1.5 text-left transition hover:border-neutral-400 dark:hover:border-white/20`}
    >
      <span className="min-w-0">
        <span className="font-medium">{item.song.title}</span>
        <span className="text-neutral-500"> · {item.song.author}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        {item.chords.map((c) => (
          <span
            key={c}
            className={`rounded-md px-1.5 py-0.5 font-mono text-xs ${
              c === item.missing ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300"
            }`}
          >
            {c}
          </span>
        ))}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Znani akordi: tap doda / odstrani (isto kot "Znam" pri lekcijah in Vseh akordih). */}
      <div>
        <div className={LABEL}>Akordi, ki jih znaš — tapni za spremembo</div>
        <div className="flex flex-wrap gap-1.5">
          {[...LESSON_CHORD_NAMES, ...[...known].filter((n) => !LESSON_CHORD_NAMES.includes(n))].map((n) => {
            const on = known.has(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleKnown(n)}
                aria-pressed={on}
                className={`${CHIP} ${on ? "border-emerald-500/60 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300" : CHIP_OFF}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />
          Poenostavi akorde (D7 → D, Am7 → Am)
        </label>
      </div>
      {unlock.length > 0 && (
        <div className={`${CARD} text-sm`}>
          <span className="font-medium">Kaj naslednje? </span>
          {unlock.map(([c, n], i) => (
            <span key={c}>
              {i > 0 && ", "}
              <button type="button" onClick={() => toggleKnown(c)} title={`Dodaj ${c} med znane`} className="font-mono font-semibold text-amber-600 underline decoration-dotted underline-offset-2 dark:text-amber-400">
                {c}
              </button>{" "}
              odklene {n}{" "}
              {n === 1 ? "skladbo" : n === 2 ? "skladbi" : n < 5 ? "skladbe" : "skladb"}
            </span>
          ))}
        </div>
      )}
      <section>
        <h3 className="mb-2 font-semibold">
          Vse znaš <span className="text-sm font-normal text-neutral-500">({ready.length})</span>
        </h3>
        {ready.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ready.map(row)}</div>
        ) : (
          <p className="text-sm text-neutral-500">
            {known.size ? "Še nobena skladba — nauči se še kakšen akord." : "Zgoraj tapni akorde, ki jih že znaš."}
          </p>
        )}
      </section>
      {almost.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">
            Manjka en akord <span className="text-sm font-normal text-neutral-500">({almost.length})</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{almost.slice(0, 60).map(row)}</div>
        </section>
      )}
    </div>
  );
}
