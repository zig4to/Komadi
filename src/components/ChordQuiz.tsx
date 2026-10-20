"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChordsLine } from "@/lib/chords";

// "Kviz" v pregledovalniku akordov: ugibanje akordov po delih skladbe. Polja so
// tam, kjer jih ima tab — v vrsticah samih akordov (intro, solo …) eno polje na
// akord (spedenaj jih piše en akord na takt), v zapetih vrsticah nad zlogom,
// kjer se akord zamenja. Lažje: bazen akordov skladbe, klik vpiše v izbrano
// polje. Težje: akorde vpišeš sam.

type Slot = { id: number; answer: string };
type QLine = { kind: "bars"; slots: Slot[] } | { kind: "pair"; chunks: { slot: Slot | null; lyric: string }[] };
type Part = { label: string; lines: QLine[]; slots: Slot[] };
type Mode = "easy" | "hard";

const MODE_KEY = "komadi:chords:quizMode";

const ENHARMONIC: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E", "E#": "F", "B#": "C" };

function normNote(s: string): { note: string; rest: string } | null {
  const m = s.match(/^([a-hA-H])([#b♯♭]?)(.*)$/);
  if (!m) return null;
  let note = m[1].toUpperCase() === "H" ? "B" : m[1].toUpperCase();
  const acc = m[2] === "♯" ? "#" : m[2] === "♭" ? "b" : m[2];
  note += acc;
  return { note: ENHARMONIC[note] ?? note, rest: m[3] };
}

// Primerjava imen: brez presledkov, H = B, enharmonija (Db = C#), "min" = "m".
export function normChord(raw: string): string {
  const x = raw.trim().replace(/\s+/g, "");
  if (!x) return "";
  const [main, bass] = x.split("/");
  const root = normNote(main);
  if (!root) return x.toLowerCase();
  const rest = root.rest.replace(/^min(?!or)/i, "m");
  const b = bass ? normNote(bass) : null;
  return `${root.note}${rest}${b ? `/${b.note}` : bass ? `/${bass}` : ""}`;
}

function buildParts(body: ChordsLine[], display: (name: string) => string): Part[] {
  const parts: Part[] = [];
  let id = 0;
  let cur: Part = { label: "Začetek", lines: [], slots: [] };
  const slot = (name: string) => {
    const s = { id: id++, answer: display(name) };
    cur.slots.push(s);
    return s;
  };
  for (const line of body) {
    if (line.kind === "section") {
      if (cur.slots.length) parts.push(cur);
      cur = { label: line.label, lines: [], slots: [] };
      continue;
    }
    if (line.kind === "chords") {
      if (line.chords.length) cur.lines.push({ kind: "bars", slots: line.chords.map((c) => slot(c.name)) });
    } else if (line.kind === "tab") {
      if (line.header?.length) cur.lines.push({ kind: "bars", slots: line.header.map((c) => slot(c.name)) });
    } else if (line.kind === "pair") {
      cur.lines.push({ kind: "pair", chunks: line.chunks.map((c) => ({ slot: c.chord ? slot(c.chord) : null, lyric: c.lyric })) });
    } else if (line.kind === "text") {
      const chunks: { slot: Slot | null; lyric: string }[] = [];
      for (const seg of line.segments) {
        if ("chord" in seg) chunks.push({ slot: slot(seg.chord), lyric: "" });
        else if (chunks.length && !chunks[chunks.length - 1].lyric) chunks[chunks.length - 1].lyric = seg.text;
        else chunks.push({ slot: null, lyric: seg.text });
      }
      if (chunks.some((c) => c.slot)) cur.lines.push({ kind: "pair", chunks });
    }
  }
  if (cur.slots.length) parts.push(cur);
  return parts;
}

export default function ChordQuiz({
  body,
  display,
  onClose,
}: {
  body: ChordsLine[];
  display: (name: string) => string;
  onClose: () => void;
}) {
  const parts = useMemo(() => buildParts(body, display), [body, display]);
  // Bazen: akordi skladbe v naključnem vrstnem redu (premešani enkrat ob odprtju
  // kviza — seme ostane, da se vrstni red ne menja ob vsakem kliku).
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const pool = useMemo(() => {
    const names = [...new Set(parts.flatMap((p) => p.slots.map((s) => s.answer)))];
    let x = seed || 1;
    const rnd = () => ((x = (x * 48271) % 2147483647) / 2147483647);
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    return names;
  }, [parts, seed]);

  const [mode, setModeState] = useState<Mode>(() => {
    try {
      return window.localStorage.getItem(MODE_KEY) === "hard" ? "hard" : "easy";
    } catch {
      return "easy";
    }
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {}
  };
  // -1 = cela skladba.
  const [partIdx, setPartIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | null>(() => parts[0]?.slots[0]?.id ?? null);
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const shown = partIdx < 0 ? parts : parts[partIdx] ? [parts[partIdx]] : [];
  const slots = shown.flatMap((p) => p.slots);
  const correct = slots.filter((s) => normChord(answers[s.id] ?? "") === normChord(s.answer)).length;

  // Ob menjavi dela: izbrano prvo prazno polje, preverjanje in rešitev skriti.
  const goPart = (i: number) => {
    setPartIdx(i);
    setChecked(false);
    setRevealed(false);
    const list = (i < 0 ? parts : [parts[i]]).flatMap((p) => p?.slots ?? []);
    setSelected(list.find((s) => !answers[s.id])?.id ?? list[0]?.id ?? null);
  };
  const setAnswer = (id: number, value: string) => setAnswers((a) => ({ ...a, [id]: value }));
  const pick = (name: string) => {
    if (selected === null) return;
    setAnswer(selected, name);
    // Naslednje prazno polje za izbranim (nato od začetka); če ga ni, naslednje polje.
    const i = slots.findIndex((s) => s.id === selected);
    const after = [...slots.slice(i + 1), ...slots.slice(0, i)];
    setSelected((after.find((s) => !answers[s.id]) ?? slots[i + 1])?.id ?? null);
  };
  // Namig: izpolni eno polje — izbrano (če ni pravilno), sicer prvo prazno ali napačno.
  const hint = () => {
    const wrong = (s: Slot) => normChord(answers[s.id] ?? "") !== normChord(s.answer);
    const sel = slots.find((s) => s.id === selected && wrong(s));
    const target = sel ?? slots.find((s) => !answers[s.id]) ?? slots.find(wrong);
    if (!target) return;
    setAnswer(target.id, target.answer);
    const i = slots.indexOf(target);
    const after = [...slots.slice(i + 1), ...slots.slice(0, i)];
    setSelected(after.find((s) => !answers[s.id])?.id ?? null);
  };
  const reset = () => {
    setAnswers((a) => {
      const n = { ...a };
      for (const s of slots) delete n[s.id];
      return n;
    });
    setChecked(false);
    setRevealed(false);
    setSelected(slots[0]?.id ?? null);
  };
  const focusNext = (id: number) => {
    const i = slots.findIndex((s) => s.id === id);
    const next = slots[i + 1];
    if (next) inputs.current.get(next.id)?.focus();
  };

  // Lažje: Backspace/Delete pobriše izbrano polje.
  useEffect(() => {
    if (mode !== "easy") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selected !== null) {
        e.preventDefault();
        setAnswers((a) => ({ ...a, [selected]: "" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected]);

  const slotState = (s: Slot) => {
    const v = answers[s.id] ?? "";
    if (revealed && !v) return "reveal";
    if (!checked || !v) return "plain";
    return normChord(v) === normChord(s.answer) ? "ok" : "bad";
  };
  const slotBox = (state: string, isSel: boolean) =>
    `flex h-8 min-w-[3.25rem] items-center justify-center rounded-lg border px-1.5 font-mono text-sm font-semibold transition lg:h-9 lg:min-w-[3.75rem] lg:text-base ${
      state === "ok"
        ? "border-emerald-400 bg-emerald-400/15 text-emerald-300"
        : state === "bad"
          ? "border-rose-500 bg-rose-500/15 text-rose-300"
          : isSel
            ? "border-rose-400 bg-rose-400/15 text-(--cv-chord) ring-2 ring-rose-400/40"
            : "border-(--cv-border) bg-(--cv-panel) text-(--cv-chord) hover:border-rose-400/70"
    }`;

  const renderSlot = (s: Slot) => {
    const state = slotState(s);
    const v = answers[s.id] ?? "";
    const hint = (state === "bad" || (revealed && state !== "ok")) && (
      <span className="mt-0.5 block text-center font-mono text-[11px] font-semibold text-emerald-400">{s.answer}</span>
    );
    if (mode === "hard")
      return (
        <span key={s.id} className="inline-flex flex-col">
          <input
            ref={(el) => {
              if (el) inputs.current.set(s.id, el);
              else inputs.current.delete(s.id);
            }}
            value={v}
            onChange={(e) => setAnswer(s.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                focusNext(s.id);
              }
            }}
            placeholder={state === "reveal" ? s.answer : ""}
            aria-label="Akord"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`${slotBox(state, false)} w-[3.25rem] text-center outline-none placeholder:text-emerald-400/70 focus:border-rose-400 lg:w-[3.75rem]`}
          />
          {state !== "reveal" && hint}
        </span>
      );
    return (
      <span key={s.id} className="inline-flex flex-col">
        <button type="button" onClick={() => setSelected(s.id)} aria-pressed={selected === s.id} className={slotBox(state, selected === s.id)}>
          {v || (state === "reveal" ? <span className="text-emerald-400/80">{s.answer}</span> : <span className="text-(--cv-muted)">?</span>)}
        </button>
        {state !== "reveal" && hint}
      </span>
    );
  };

  const renderLine = (line: QLine, i: number) =>
    line.kind === "bars" ? (
      <div key={i} className="flex flex-wrap items-start gap-1.5">
        <span aria-hidden="true" className="self-center text-(--cv-muted)">|</span>
        {line.slots.map((s) => (
          <span key={s.id} className="flex items-start gap-1.5">
            {renderSlot(s)}
            <span aria-hidden="true" className="mt-1.5 text-(--cv-muted) lg:mt-2">|</span>
          </span>
        ))}
      </div>
    ) : (
      <div key={i} className="flex flex-wrap items-end">
        {line.chunks.map((c, j) => (
          <span key={j} className="inline-flex flex-col items-start pr-1">
            {c.slot ? renderSlot(c.slot) : <span className="h-8 lg:h-9" />}
            <span className="whitespace-pre text-[15px] text-(--cv-text) lg:text-base">{c.lyric || " "}</span>
          </span>
        ))}
      </div>
    );

  const btn = "rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 lg:text-sm";

  return (
    <div className="font-sans" data-no-card-click>
      {/* Glava: težavnost, del, dejanja. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-400/[0.05] p-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-300">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
          Kviz
        </span>
        <div role="group" aria-label="Težavnost" className="flex rounded-full border border-rose-400/40 p-0.5">
          {(["easy", "hard"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${mode === m ? "bg-rose-500 text-white" : "text-(--cv-text) hover:text-rose-300"}`}
            >
              {m === "easy" ? "Lažje" : "Težje"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goPart(partIdx <= 0 ? partIdx : partIdx - 1)}
            disabled={partIdx <= 0}
            aria-label="Prejšnji del"
            className="flex h-7 w-7 items-center justify-center rounded-full text-rose-300 hover:bg-rose-400/15 disabled:opacity-30"
          >
            ‹
          </button>
          <select
            value={partIdx}
            onChange={(e) => goPart(Number(e.target.value))}
            aria-label="Del skladbe"
            className="rounded-lg border border-rose-400/40 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 lg:text-sm"
          >
            {parts.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
            <option value={-1}>Cela skladba</option>
          </select>
          <button
            type="button"
            onClick={() => goPart(partIdx < 0 || partIdx >= parts.length - 1 ? partIdx : partIdx + 1)}
            disabled={partIdx < 0 || partIdx >= parts.length - 1}
            aria-label="Naslednji del"
            className="flex h-7 w-7 items-center justify-center rounded-full text-rose-300 hover:bg-rose-400/15 disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {checked && (
            <span className={`text-sm font-semibold tabular-nums ${correct === slots.length ? "text-emerald-400" : "text-rose-300"}`}>
              {correct}/{slots.length}
            </span>
          )}
          <button type="button" onClick={() => setChecked(true)} className={`${btn} border-rose-400 bg-rose-500 text-white hover:bg-rose-400`}>
            Preveri
          </button>
          <button type="button" onClick={hint} title="Izpolni eno polje" className={`${btn} border-rose-400/50 text-rose-300 hover:bg-rose-400/10`}>
            Namig
          </button>
          <button type="button" onClick={() => setRevealed((v) => !v)} className={`${btn} border-rose-400/50 text-rose-300 hover:bg-rose-400/10`}>
            {revealed ? "Skrij rešitev" : "Pokaži rešitev"}
          </button>
          <button type="button" onClick={reset} className={`${btn} border-rose-400/50 text-rose-300 hover:bg-rose-400/10`}>
            Ponovi
          </button>
          <button type="button" onClick={onClose} aria-label="Zapri kviz" title="Zapri kviz" className="flex h-7 w-7 items-center justify-center rounded-full text-rose-300 hover:bg-rose-400/15">
            ✕
          </button>
        </div>
      </div>

      {/* Lažje: bazen akordov skladbe. */}
      {mode === "easy" && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-(--cv-border) bg-(--cv-bg) p-2 shadow-lg">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-(--cv-muted)">Akordi</span>
          {pool.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              disabled={selected === null}
              className="rounded-lg border border-rose-400/50 px-2.5 py-1 font-mono text-sm font-semibold text-(--cv-chord) transition hover:bg-rose-400/15 disabled:opacity-40 active:scale-95"
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => selected !== null && setAnswer(selected, "")}
            disabled={selected === null || !answers[selected]}
            className="ml-auto rounded-lg px-2 py-1 text-xs text-(--cv-muted) hover:text-rose-300 disabled:opacity-40"
          >
            Pobriši polje
          </button>
        </div>
      )}

      <div className="space-y-6">
        {shown.map((p, pi) => (
          <section key={pi}>
            <p className="mb-2 text-sm font-semibold text-(--cv-section)">{p.label}</p>
            <div className="space-y-3">{p.lines.map(renderLine)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
