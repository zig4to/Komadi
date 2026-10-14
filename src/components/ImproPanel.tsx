"use client";

import { useMemo, useRef, useState } from "react";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { NAMES, detectKey, improGroups, keyName, mod12, type SongKey } from "@/lib/scales";
import { CLOSE_BUTTON, CLOSE_ICON, ScaleBoard, useIsDesktop } from "@/components/Scales";

// "Impro" v pregledovalniku akordov: iz akordov skladbe (kot so prikazani —
// s transpozicijo in Simpl) zazna tonaliteto in predlaga lestvice za
// improvizacijo po skupinah (pentatonike in blues, lestvice in modusi,
// vzporedna tonaliteta), znotraj skupine po deležu tonov akordov, ki so v
// lestvici. Izbrano lestvico pokaže na vratu kitare kot stran Lestvice.
// Računalnik: stolpec ob desnem robu, širino se vleče za levi rob
// (komadi:chords:improWidth); telefon: čez cel zaslon.

const SELECT =
  "min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 outline-none focus:border-indigo-400 dark:border-white/[0.1] dark:bg-[#16161b] dark:text-neutral-100";
const STEP =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm transition hover:bg-indigo-600 active:scale-95 disabled:opacity-30 dark:bg-indigo-500 dark:hover:bg-indigo-400";
const chevron = (d: string) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d={d} />
  </svg>
);

const WIDTH_KEY = "komadi:chords:improWidth";
const DEFAULT_WIDTH = 608;
const MIN_WIDTH = 320;
// Besedilu levo ostane vsaj toliko prostora.
const MIN_TEXT = 320;

function readWidth() {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(v) && v >= MIN_WIDTH) return v;
  } catch {}
  return DEFAULT_WIDTH;
}

const keyValue = (k: SongKey) => `${k.tonic}:${k.minor ? "m" : "M"}`;

export default function ImproPanel({ chords, capo, onClose }: { chords: string[]; capo: number | null; onClose: () => void }) {
  useBackableOpen(true, onClose);
  const detected = useMemo(() => detectKey(chords), [chords]);
  const [keyOverride, setKeyOverride] = useState<SongKey | null>(null);
  // S capom so akordi prijemi; "Brez capa" premakne lestvice na zveneče tone.
  const [noCapo, setNoCapo] = useState(false);
  const shift = capo && noCapo ? capo : 0;
  const shapeKey = keyOverride ?? detected;
  const key = shapeKey ? { tonic: mod12(shapeKey.tonic + shift), minor: shapeKey.minor } : null;
  const soundingChords = shift ? chords.map((c) => shiftChord(c, shift)) : chords;
  const groups = key ? improGroups(key, soundingChords) : [];
  const flat = groups.flatMap((g) => g.options);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = Math.max(0, flat.findIndex((o) => o.id === selectedId));
  const current = flat[index];
  const [pos, setPos] = useState(1);
  const [labels, setLabels] = useState<"note" | "int">("note");
  const desktop = useIsDesktop();
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Vlečenje levega roba: širina = desni rob plošče − kazalec.
  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!dragging || !panel) return;
    const right = panel.getBoundingClientRect().right;
    const parent = panel.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    setWidth(Math.round(Math.max(MIN_WIDTH, Math.min(parent - MIN_TEXT, right - e.clientX))));
  }
  function onResizeUp() {
    if (!dragging) return;
    setDragging(false);
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {}
  }

  function select(id: string) {
    setSelectedId(id);
    setPos(1);
  }
  const step = (d: number) => {
    if (!flat.length) return;
    select(flat[(index + d + flat.length) % flat.length].id);
  };

  return (
    <div
      ref={panelRef}
      className={`fixed inset-0 z-[60] flex flex-col bg-white font-sans text-neutral-900 lg:relative lg:inset-auto lg:z-auto lg:max-w-[calc(100%-20rem)] lg:shrink-0 lg:border-l lg:border-neutral-200 dark:bg-[#0d0d10] dark:text-neutral-100 lg:dark:border-white/[0.08] ${
        dragging ? "select-none" : ""
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        width: desktop ? width : undefined,
      }}
    >
      {/* Ročaj za širino (računalnik): levi rob plošče. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Širina plošče Impro"
        title="Povleci za širino"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH);
          try {
            localStorage.removeItem(WIDTH_KEY);
          } catch {}
        }}
        className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none lg:block"
      >
        <div
          className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
            dragging ? "bg-indigo-500" : "bg-transparent group-hover:bg-indigo-400/70"
          }`}
        />
        <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-300 group-hover:bg-indigo-400 dark:bg-white/20" />
      </div>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-indigo-500 dark:text-indigo-400">
          <path d="M3 6h18M3 10h18M3 14h18M3 18h18" />
          <circle cx="7" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="17" cy="16" r="1.4" fill="currentColor" />
        </svg>
        <h2 className="flex-1 text-base font-semibold">Impro</h2>
        <button type="button" onClick={onClose} aria-label="Zapri" title="Zapri" className={CLOSE_BUTTON}>
          {CLOSE_ICON}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!key || !current ? (
          <p className="px-4 py-6 text-sm text-neutral-500">V skladbi ni akordov, iz katerih bi lahko določil tonaliteto.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 border-b border-neutral-200 px-4 py-3.5 dark:border-white/[0.08]">
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-neutral-500">Tonaliteta</span>
                <select
                  value={keyValue(shapeKey!)}
                  onChange={(e) => {
                    const [t, m] = e.target.value.split(":");
                    const k = { tonic: Number(t), minor: m === "m" };
                    setKeyOverride(detected && keyValue(k) === keyValue(detected) ? null : k);
                    setSelectedId(null);
                    setPos(1);
                  }}
                  className={SELECT}
                >
                  {[false, true].map((minor) => (
                    <optgroup key={String(minor)} label={minor ? "Mol" : "Dur"}>
                      {NAMES.map((n, t) => {
                        const k = { tonic: t, minor };
                        return (
                          <option key={t} value={keyValue(k)}>
                            {keyName(k)}
                            {detected && keyValue(k) === keyValue(detected) ? " (zaznano)" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                {capo ? (
                  <button
                    type="button"
                    aria-pressed={noCapo}
                    onClick={() => {
                      setNoCapo((v) => !v);
                      setSelectedId(null);
                      setPos(1);
                    }}
                    title={`Akordi so prijemi s capom na ${capo}. prečki — vklopi za lestvice brez capa (kot zveni).`}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      noCapo
                        ? "border-indigo-400 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                        : "border-neutral-200 text-neutral-600 dark:border-white/[0.1] dark:text-neutral-300"
                    }`}
                  >
                    {noCapo ? `Brez capa: ${keyName(key)}` : `Brez capa (capo ${capo})`}
                  </button>
                ) : null}
              </label>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => step(-1)} aria-label="Prejšnja lestvica" title="Prejšnja lestvica" className={STEP}>
                  {chevron("M15 6l-6 6 6 6")}
                </button>
                <select value={current.id} onChange={(e) => select(e.target.value)} className={`${SELECT} w-auto max-w-full`} aria-label="Lestvica">
                  {groups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {NAMES[o.root]} {o.scale.name.toLowerCase()} · {Math.round(o.fit * 100)} %
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button type="button" onClick={() => step(1)} aria-label="Naslednja lestvica" title="Naslednja lestvica" className={STEP}>
                  {chevron("M9 6l6 6-6 6")}
                </button>
              </div>
              <div className="text-xs text-neutral-500">
                {groups.find((g) => g.options.includes(current))?.label}
                {current.note ? ` · ${current.note}` : ""} · {Math.round(current.fit * 100)} % tonov akordov skladbe je v lestvici · {index + 1}/{flat.length}
              </div>
            </div>
            <ScaleBoard root={current.root} scale={current.scale} pos={pos} labels={labels} onPos={setPos} onLabels={setLabels} />
          </>
        )}
      </div>
    </div>
  );
}

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
// Premakne koren akorda za n poltonov (samo za oceno ujemanja).
function shiftChord(name: string, n: number) {
  const m = name.match(/^([A-H])([#b]?)(.*)$/);
  if (!m) return name;
  const pc = mod12(PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + n);
  return SHARP[pc] + m[3].split("/")[0];
}
