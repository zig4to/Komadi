"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AutoScrollControl from "@/components/AutoScrollControl";
import YouTubeMiniPlayer, { youTubeVideoId } from "@/components/YouTubeMiniPlayer";
import { findCapo, layoutChordLine, parseChords, simplifyChord, splitDescription, transposeChord, type ChordsLine } from "@/lib/chords";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { Song } from "@/types/song";

// Vgrajen pregledovalnik akordov (v slogu UG Tabs app): songs.chords_text
// (UG markup) izrisan kot tekst — akordi nad besedilom, transpozicija,
// velikost pisave, samodejno pomikanje (AutoScrollControl). Dodatna možnost
// ob obstoječih povezavah/PDF v ChordsButtons.tsx, ne nadomestilo.

const FONT_KEY = "komadi:chords:font";
const SIMPLIFY_KEY = "komadi:chords:simplify";
const transposeKey = (id: string) => `komadi:chords:transpose:${id}`;
const workingVideoKey = (id: string) => `komadi:chords:video:${id}`;
const MIN_FONT = 10;
const MAX_FONT = 28;
const FONT_STEP = 0.5;

function readNumber(key: string, fallback: number) {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && window.localStorage.getItem(key) !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

// Zamik v razponu −5 … +6 poltonov (±12 je ista tonaliteta).
function wrap(n: number) {
  const m = ((n % 12) + 12) % 12;
  return m > 6 ? m - 12 : m;
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export default function ChordsViewer({ song, onClose }: { song: Song; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [semitones, setSemitones] = useState(() => readNumber(transposeKey(song.id), 0));
  const [fontSize, setFontSize] = useState(() => readNumber(FONT_KEY, 15));
  // Opis (album, avtor transkripcije, opombe …) je skrit pod "Opis skladbe";
  // na vrhu ostanejo samo naslov, avtor in capo (če ga opis omenja).
  const { description, body, capo } = useMemo(() => {
    const parts = splitDescription(parseChords(song.chords_text ?? ""));
    return { ...parts, capo: findCapo(parts.description) };
  }, [song.chords_text]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // Mini predvajalnik: youtube_url (za tuje pogosto lyric video), sicer YouTube Music.
  const watchUrl = youTubeVideoId(song.youtube_url) ? song.youtube_url : song.youtube_music_url;
  // Kandidati po vrsti: video, ki je pri tej skladbi že deloval (zapomnjen v
  // brskalniku), youtube_url, YouTube Music, nato rezervni iz iskanja
  // (youtube_embed_ids) — predvajalnik ob napaki 101/150 preizkusi naslednjega.
  const [videoIds] = useState(() => {
    let remembered: string | null = null;
    try {
      remembered = window.localStorage.getItem(workingVideoKey(song.id));
    } catch {}
    return [
      ...new Set([
        remembered,
        youTubeVideoId(song.youtube_url),
        youTubeVideoId(song.youtube_music_url),
        ...(song.youtube_embed_ids ?? []),
      ]),
    ].filter((id): id is string => Boolean(id));
  });

  useBackableOpen(true, onClose);

  useEffect(() => writeNumber(transposeKey(song.id), semitones), [song.id, semitones]);
  useEffect(() => writeNumber(FONT_KEY, fontSize), [fontSize]);

  // "Poenostavi" (D7 → D, Am7 → Am …) — ena nastavitev za vse skladbe.
  const [simplify, setSimplify] = useState(() => readNumber(SIMPLIFY_KEY, 0) === 1);
  useEffect(() => writeNumber(SIMPLIFY_KEY, simplify ? 1 : 0), [simplify]);

  const shift = (d: number) => setSemitones((s) => wrap(s + d));
  const display = (name: string) => {
    const t = transposeChord(name, semitones);
    return simplify ? simplifyChord(t) : t;
  };

  // Ena vrstica pesmi ali opisa (glej ChordsLine v src/lib/chords.ts).
  const renderLine = (line: ChordsLine, i: number) => {
    if (line.kind === "section") {
      return (
        <div key={i} className="mt-3 font-sans font-semibold text-neutral-400">
          {line.label}
        </div>
      );
    }
    if (line.kind === "chords") {
      return (
        <div key={i} className="whitespace-pre font-bold text-amber-400">
          {layoutChordLine(line.chords, display).map((c, j) => (
            <span key={j}>
              {" ".repeat(c.pad)}
              {c.name}
            </span>
          ))}
        </div>
      );
    }
    if (line.kind === "pair") {
      // Vsak kos = akord nad svojim delom besedila. Daljše ime akorda
      // (tudi po transpoziciji) razširi kos, ne zamakne akorda; vrstica
      // se na ozkem zaslonu prelomi med kosi (ali znotraj dolgega kosa).
      return (
        <div key={i} className="flex flex-wrap">
          {line.chunks.map((c, j) => {
            const name = c.chord === null ? null : display(c.chord);
            const isLast = j === line.chunks.length - 1;
            return (
              <span
                key={j}
                className="inline-flex max-w-full flex-col"
                style={name ? { minWidth: `${name.length + (isLast ? 0 : 1)}ch` } : undefined}
              >
                <span className="whitespace-pre font-bold text-amber-400">{name ?? " "}</span>
                <span className="whitespace-pre-wrap">{c.lyric || " "}</span>
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <div key={i} className="min-h-[1.375em] whitespace-pre-wrap">
        {line.segments.map((s, j) =>
          "chord" in s ? (
            <span key={j} className="font-bold text-amber-400">
              {display(s.chord)}
            </span>
          ) : (
            <span key={j}>{s.text}</span>
          ),
        )}
      </div>
    );
  };

  const toolButton =
    "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white disabled:opacity-40 active:scale-95";

  return createPortal(
    <div data-view-portal onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-neutral-900 px-4 py-2">
        <span className="shrink-0 text-sm font-medium text-neutral-300">Akordi</span>
        {videoIds.length > 0 ? <YouTubeMiniPlayer
            videoIds={videoIds}
            watchUrl={watchUrl ?? `https://www.youtube.com/watch?v=${videoIds[0]}`}
            onPlaying={(id) => {
              try {
                window.localStorage.setItem(workingVideoKey(song.id), id);
              } catch {}
            }}
          /> : <span className="flex-1" />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Zapri"
          title="Zapri"
          className="shrink-0 p-1 text-neutral-300 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Transpozicija">
          <span className="mr-1 text-xs text-neutral-400">Ton</span>
          <button type="button" onClick={() => shift(-1)} aria-label="Pol tona nižje" title="Pol tona nižje" className={toolButton}>
            −
          </button>
          <button
            type="button"
            onClick={() => setSemitones(0)}
            title="Izvirna tonaliteta"
            className={`${toolButton} w-12 tabular-nums ${semitones !== 0 ? "text-amber-400" : ""}`}
          >
            {semitones > 0 ? `+${semitones}` : semitones}
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Pol tona višje" title="Pol tona višje" className={toolButton}>
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSimplify((v) => !v)}
          aria-pressed={simplify}
          title="Poenostavi akorde (D7 → D, Am7 → Am)"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 ${
            simplify
              ? "border-amber-400 bg-amber-400/15 text-amber-400"
              : "border-neutral-600 text-neutral-200 hover:border-amber-400 hover:text-white"
          }`}
        >
          Poenostavi
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Velikost pisave">
          <button
            type="button"
            onClick={() => setFontSize((f) => Math.max(MIN_FONT, f - FONT_STEP))}
            disabled={fontSize <= MIN_FONT}
            aria-label="Manjša pisava"
            title="Manjša pisava"
            className={`${toolButton} text-xs`}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => setFontSize((f) => Math.min(MAX_FONT, f + FONT_STEP))}
            disabled={fontSize >= MAX_FONT}
            aria-label="Večja pisava"
            title="Večja pisava"
            className={`${toolButton} text-base`}
          >
            A+
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 pb-32 pt-4">
        <div className="font-mono leading-snug text-neutral-100" style={{ fontSize }}>
          <div className="mb-4 font-sans">
            <h2 className="text-xl font-semibold text-white">{song.title}</h2>
            <p className="text-sm text-neutral-400">{song.author}</p>
            {capo !== null && (
              <p className="mt-1 text-sm font-medium text-amber-400">Capo: {capo}. prag</p>
            )}
            {description.length > 0 && (
              <button
                type="button"
                onClick={() => setDescriptionOpen((v) => !v)}
                aria-expanded={descriptionOpen}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-neutral-600 px-3 py-1 text-xs font-medium text-neutral-200 hover:border-amber-400 hover:text-white"
              >
                Opis skladbe
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3.5 w-3.5 transition ${descriptionOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
          </div>
          {descriptionOpen && (
            <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-[0.85em] text-neutral-300">
              {description.map(renderLine)}
            </div>
          )}
          {body.map(renderLine)}
        </div>
      </div>

      <AutoScrollControl scrollRef={scrollRef} speedFactor={2.5} />
    </div>,
    document.body,
  );
}
