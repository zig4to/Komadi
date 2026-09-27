"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import AutoScrollControl from "@/components/AutoScrollControl";
import YouTubeMiniPlayer, { youTubeVideoId } from "@/components/YouTubeMiniPlayer";
import {
  applyEditedText,
  findCapo,
  layoutChordLine,
  parseChords,
  simplifyChord,
  splitDescription,
  toEditableText,
  transposeChord,
  type ChordsLine,
} from "@/lib/chords";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { Song } from "@/types/song";

// Vgrajen pregledovalnik akordov (v slogu UG Tabs app): songs.chords_text
// (UG markup) izrisan kot tekst — akordi nad besedilom, transpozicija,
// velikost pisave, samodejno pomikanje (AutoScrollControl). Dodatna možnost
// ob obstoječih povezavah/PDF v ChordsButtons.tsx, ne nadomestilo.

const FONT_KEY = "komadi:chords:font";
const SIMPLIFY_KEY = "komadi:chords:simplify";
const BG_KEY = "komadi:chords:bg";
const CHORD_COLOR_KEY = "komadi:chords:chordColor";
const transposeKey = (id: string) => `komadi:chords:transpose:${id}`;
const workingVideoKey = (id: string) => `komadi:chords:video:${id}`;
const MIN_FONT = 10;
const MAX_FONT = 28;
const FONT_STEP = 0.5;
// Skrivanje/prikaz zgornjih vrstic ob samodejnem pomikanju: mehak ease-in-out.
const BARS_TRANSITION = "550ms cubic-bezier(0.65, 0, 0.35, 1)";

// Ozadja vsebine pregledovalnika (gumb "Tema"). Zgornji vrstici ostaneta temni.
const BACKGROUNDS = [
  { label: "Bela", light: true, bg: "#ffffff", text: "#171717", title: "#0a0a0a", muted: "#737373", panel: "#f5f5f5", border: "#d4d4d4" },
  { label: "Siva", light: true, bg: "#e5e5e5", text: "#171717", title: "#0a0a0a", muted: "#525252", panel: "#d4d4d4", border: "#a3a3a3" },
  { label: "Temno siva", light: false, bg: "#262626", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#171717", border: "#525252" },
  { label: "Črna", light: false, bg: "#0a0a0a", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#171717", border: "#525252" },
];
const DEFAULT_BG = 3;
// Barve akordov: svetlejša različica za temno ozadje, temnejša za svetlo.
const CHORD_COLORS = [
  { label: "Rumena", dark: "#fbbf24", light: "#b45309" },
  { label: "Oranžna", dark: "#fb923c", light: "#c2410c" },
  { label: "Rdeča", dark: "#f87171", light: "#dc2626" },
  { label: "Modra", dark: "#38bdf8", light: "#0369a1" },
  { label: "Zelena", dark: "#4ade80", light: "#15803d" },
];

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
  // Zapis akordov; po shranjevanju iz urejevalnika ("Uredi") takoj nova
  // različica (globalni songs v Dashboard.tsx posodobi realtime).
  const [chordsText, setChordsText] = useState(song.chords_text ?? "");
  // Opis (album, avtor transkripcije, opombe …) je skrit pod "Opis skladbe";
  // na vrhu ostanejo samo naslov, avtor in capo (če ga opis omenja).
  const { description, body, capo } = useMemo(() => {
    const parts = splitDescription(parseChords(chordsText));
    return { ...parts, capo: findCapo(parts.description) };
  }, [chordsText]);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // Celozaslonski način med samodejnim pomikanjem (AutoScrollControl onPlayingChange).
  const [fullscreen, setFullscreen] = useState(false);
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

  // "Tema": ozadje vsebine in barva akordov — ena nastavitev za vse skladbe.
  const [bgIndex, setBgIndex] = useState(() => readNumber(BG_KEY, DEFAULT_BG));
  const [chordColorIndex, setChordColorIndex] = useState(() => readNumber(CHORD_COLOR_KEY, 0));
  useEffect(() => writeNumber(BG_KEY, bgIndex), [bgIndex]);
  useEffect(() => writeNumber(CHORD_COLOR_KEY, chordColorIndex), [chordColorIndex]);
  const theme = BACKGROUNDS[bgIndex] ?? BACKGROUNDS[DEFAULT_BG];
  const chordColor = CHORD_COLORS[chordColorIndex] ?? CHORD_COLORS[0];
  const themeVars = {
    "--cv-bg": theme.bg,
    "--cv-text": theme.text,
    "--cv-title": theme.title,
    "--cv-muted": theme.muted,
    "--cv-panel": theme.panel,
    "--cv-border": theme.border,
    "--cv-chord": theme.light ? chordColor.light : chordColor.dark,
  } as CSSProperties;

  // Izbirnik teme: fixed pod gumbom (vrstica z gumbi ima overflow-hidden).
  const [themeMenuPos, setThemeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const closeThemeMenu = () => setThemeMenuPos(null);
  const toggleThemeMenu = () => {
    if (themeMenuPos) return closeThemeMenu();
    const r = themeButtonRef.current?.getBoundingClientRect();
    if (!r) return;
    setThemeMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
  };
  useBackableOpen(themeMenuPos !== null, closeThemeMenu);
  useEffect(() => {
    if (!themeMenuPos) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (themeMenuRef.current?.contains(t) || themeButtonRef.current?.contains(t)) return;
      setThemeMenuPos(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [themeMenuPos]);

  // "Uredi": zapis kot navadno besedilo (akordi nad besedilom, brez UG oznak).
  // Shrani zapiše samo spremenjene vrstice v UG obliki (applyEditedText).
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editing = draft !== null;
  const startEdit = () => {
    closeThemeMenu();
    setEditError(null);
    setDraft(toEditableText(chordsText));
  };
  const cancelEdit = () => {
    if (draft !== null && draft !== toEditableText(chordsText) && !window.confirm("Zavržem spremembe?")) return;
    setDraft(null);
  };
  const saveEdit = async () => {
    if (draft === null) return;
    if (draft === toEditableText(chordsText)) return setDraft(null);
    const next = applyEditedText(chordsText, draft);
    setSaving(true);
    setEditError(null);
    const { error } = await supabase.from("songs").update({ chords_text: next }).eq("id", song.id);
    setSaving(false);
    if (error) return setEditError(`Shranjevanje ni uspelo: ${error.message}`);
    setChordsText(next);
    setDraft(null);
  };
  useBackableOpen(editing, cancelEdit);

  const shift = (d: number) => setSemitones((s) => wrap(s + d));
  const display = (name: string) => {
    const t = transposeChord(name, semitones);
    return simplify ? simplifyChord(t) : t;
  };

  // Tablature v pesmi so privzeto skrite (ostane samo vrstica akordov nad
  // njimi); gumb "Tab" ob naslovu sekcije jih prikaže za to sekcijo. Lastnik
  // tablature = indeks njene sekcije; tablature pred prvo sekcijo imajo -1
  // in svoj gumb pri prvi od njih.
  const { tabOwner, sectionsWithTabs, firstOrphanTab } = useMemo(() => {
    const owner = new Map<number, number>();
    const sections = new Set<number>();
    let current = -1;
    let firstOrphan = -1;
    body.forEach((l, i) => {
      if (l.kind === "section") current = i;
      if (l.kind !== "tab") return;
      owner.set(i, current);
      if (current === -1) {
        if (firstOrphan === -1) firstOrphan = i;
      } else sections.add(current);
    });
    return { tabOwner: owner, sectionsWithTabs: sections, firstOrphanTab: firstOrphan };
  }, [body]);
  const [openTabs, setOpenTabs] = useState<Set<number>>(() => new Set());
  const toggleTabs = (key: number) =>
    setOpenTabs((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const tabButton = (key: number) => (
    <button
      type="button"
      onClick={() => toggleTabs(key)}
      aria-pressed={openTabs.has(key)}
      title={openTabs.has(key) ? "Skrij tablaturo" : "Prikaži tablaturo"}
      className={`rounded-full border border-orange-400 px-2 py-0.5 font-sans text-xs font-medium leading-tight transition active:scale-95 ${
        openTabs.has(key) ? "bg-orange-400/15 text-(--cv-chord)" : "text-(--cv-muted)"
      }`}
    >
      Tab
    </button>
  );

  // Ena vrstica pesmi ali opisa (glej ChordsLine v src/lib/chords.ts).
  // inBody: v pesmi (tablature skrite za gumbom "Tab"), sicer v opisu (vse vidno).
  const renderLine = (line: ChordsLine, i: number, inBody: boolean) => {
    if (line.kind === "section") {
      return (
        <div key={i} className="mt-3 flex items-center gap-2 font-sans font-semibold text-(--cv-muted)">
          {line.label}
          {inBody && sectionsWithTabs.has(i) && tabButton(i)}
        </div>
      );
    }
    if (line.kind === "chords") {
      return (
        <div key={i} className="whitespace-pre font-bold text-(--cv-chord)">
          {layoutChordLine(line.chords, display).map((c, j) => (
            <span key={j}>
              {" ".repeat(c.pad)}
              {c.name}
            </span>
          ))}
        </div>
      );
    }
    if (line.kind === "tab") {
      const owner = tabOwner.get(i) ?? -1;
      const showStaff = !inBody || openTabs.has(owner);
      const orphanButton = inBody && i === firstOrphanTab && <div className="mt-3">{tabButton(-1)}</div>;
      if (!showStaff && !line.header) return <div key={i}>{orphanButton}</div>;
      if (!showStaff && line.header) {
        // Skrita tablatura: samo zaporedje akordov, vsak enako širok
        // (4 znake, daljši + presledek), brez vodoravnega pomika.
        return (
          <div key={i}>
            {orphanButton}
            <div className="flex flex-wrap font-bold text-(--cv-chord)">
              {line.header.map((c, j) => {
                const name = display(c.name);
                return (
                  <span key={j} className="whitespace-pre" style={{ minWidth: `${Math.max(4, name.length + 1)}ch` }}>
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        );
      }
      // Brez preloma: strune morajo ostati poravnane; široka tablatura se
      // pomika vodoravno (s prstom), velikost pisave ostane ista.
      return (
        <div key={i} className="overflow-x-auto">
          {orphanButton}
          <div className="w-max whitespace-pre">
            {line.header && (
              <div className="font-bold text-(--cv-chord)">
                {layoutChordLine(line.header, display).map((c, j) => (
                  <span key={j}>
                    {" ".repeat(c.pad)}
                    {c.name}
                  </span>
                ))}
              </div>
            )}
            {showStaff && line.lines.map((l, j) => <div key={j}>{l}</div>)}
          </div>
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
                <span className="whitespace-pre font-bold text-(--cv-chord)">{name ?? " "}</span>
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
            <span key={j} className="font-bold text-(--cv-chord)">
              {display(s.chord)}
            </span>
          ) : (
            <span key={j}>{s.text}</span>
          ),
        )}
      </div>
    );
  };

  // Manjši gumbi za strnjeni skupini "Ton" in velikost pisave (oranžna obroba okrog celote).
  const toneButton =
    "flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white disabled:opacity-40 active:scale-95";

  return createPortal(
    <div data-view-portal onClick={(e) => e.stopPropagation()} style={themeVars} className="fixed inset-0 z-50 flex flex-col bg-(--cv-bg)">
      {/* Med samodejnim pomikanjem zgornji vrstici zdrsneta gor (celozaslonski
          način), ob pavzi se vrneta. Skrito s CSS, ne odstranjeno — predvajalnik
          mora ostati, da glasba igra naprej. */}
      <div
        className="grid shrink-0"
        style={{ gridTemplateRows: fullscreen ? "0fr" : "1fr", transition: `grid-template-rows ${BARS_TRANSITION}` }}
        aria-hidden={fullscreen}
      >
      <div
        className="min-h-0 overflow-hidden"
        // Brez transform: ta bi fixed sličico YouTube videa (znotraj vrstice) ujel v ta okvir.
        style={{ opacity: fullscreen ? 0 : 1, transition: `opacity ${BARS_TRANSITION}` }}
      >
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

      <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-1.5">
        <div
          className="flex items-center rounded-full border border-orange-400 py-0.5 pl-2.5 pr-0.5"
          role="group"
          aria-label="Transpozicija"
        >
          <span className="mr-0.5 text-xs text-neutral-400">Ton</span>
          <button type="button" onClick={() => shift(-1)} aria-label="Pol tona nižje" title="Pol tona nižje" className={toneButton}>
            −
          </button>
          <button
            type="button"
            onClick={() => setSemitones(0)}
            title="Izvirna tonaliteta"
            className={`${toneButton} w-7 tabular-nums ${semitones !== 0 ? "text-amber-400" : ""}`}
          >
            {semitones > 0 ? `+${semitones}` : semitones}
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Pol tona višje" title="Pol tona višje" className={toneButton}>
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSimplify((v) => !v)}
          aria-pressed={simplify}
          title="Poenostavi akorde (D7 → D, Am7 → Am)"
          className={`flex h-8 items-center rounded-full border border-orange-400 px-2.5 text-xs font-medium transition active:scale-95 ${
            simplify ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          Poenostavi
        </button>
        <div className="flex items-center rounded-full border border-orange-400 p-0.5" role="group" aria-label="Velikost pisave">
          <button
            type="button"
            onClick={() => setFontSize((f) => Math.max(MIN_FONT, f - FONT_STEP))}
            disabled={fontSize <= MIN_FONT}
            aria-label="Manjša pisava"
            title="Manjša pisava"
            className={`${toneButton} px-1.5 text-xs`}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => setFontSize((f) => Math.min(MAX_FONT, f + FONT_STEP))}
            disabled={fontSize >= MAX_FONT}
            aria-label="Večja pisava"
            title="Večja pisava"
            className={`${toneButton} px-1.5 text-base`}
          >
            A+
          </button>
        </div>
        <button
          ref={themeButtonRef}
          type="button"
          onClick={toggleThemeMenu}
          aria-expanded={themeMenuPos !== null}
          title="Barva ozadja in akordov"
          className={`flex h-8 items-center gap-1 rounded-full border border-orange-400 px-2.5 text-xs font-medium transition active:scale-95 ${
            themeMenuPos ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          </svg>
          Tema
        </button>
        <button
          type="button"
          onClick={editing ? cancelEdit : startEdit}
          aria-pressed={editing}
          title="Uredi besedilo in akorde"
          className={`flex h-8 items-center gap-1 rounded-full border border-orange-400 px-2.5 text-xs font-medium transition active:scale-95 ${
            editing ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </svg>
          Uredi
        </button>
      </div>
      </div>
      </div>

      {themeMenuPos && (
        <div
          ref={themeMenuRef}
          role="dialog"
          aria-label="Tema"
          style={{ top: themeMenuPos.top, left: themeMenuPos.left }}
          className="fixed z-10 w-56 space-y-3 rounded-xl border border-orange-400 bg-neutral-900 p-3 shadow-xl"
        >
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-400">Ozadje</p>
            <div className="flex justify-between">
              {BACKGROUNDS.map((b, i) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setBgIndex(i)}
                  aria-pressed={bgIndex === i}
                  title={b.label}
                  className="flex w-12 flex-col items-center gap-1 text-[10px] leading-tight text-neutral-300"
                >
                  <span
                    style={{ backgroundColor: b.bg }}
                    className={`h-7 w-7 rounded-full border border-neutral-600 ${bgIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
                  />
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-400">Barva akordov</p>
            <div className="flex justify-between">
              {CHORD_COLORS.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setChordColorIndex(i)}
                  aria-pressed={chordColorIndex === i}
                  aria-label={c.label}
                  title={c.label}
                  style={{ backgroundColor: c.dark }}
                  className={`h-7 w-7 rounded-full ${chordColorIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-(--cv-muted)">
              Akorde piši v svojo vrstico nad besedilo, razdelke kot [Refren].
            </p>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-full border border-(--cv-border) px-3 py-1 text-xs font-medium text-(--cv-text) disabled:opacity-50"
            >
              Prekliči
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="rounded-full border border-orange-400 bg-orange-400/15 px-3 py-1 text-xs font-semibold text-(--cv-chord) disabled:opacity-50"
            >
              {saving ? "Shranjujem …" : "Shrani"}
            </button>
          </div>
          {editError && <p className="text-xs font-medium text-red-500">{editError}</p>}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Besedilo in akordi"
            style={{ fontSize }}
            className="min-h-0 flex-1 resize-none overflow-auto whitespace-pre rounded-lg border border-(--cv-border) bg-(--cv-panel) p-3 font-mono leading-snug text-(--cv-text) outline-none focus:border-orange-400"
          />
        </div>
      )}

      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto px-4 pb-32 pt-4 ${editing ? "hidden" : ""}`}>
        <div className="font-mono leading-snug text-(--cv-text)" style={{ fontSize }}>
          <div className="mb-4 font-sans">
            <h2 className="text-xl font-semibold text-(--cv-title)">{song.title}</h2>
            <p className="text-sm text-(--cv-muted)">{song.author}</p>
            {capo !== null && (
              <p className="mt-1 text-sm font-medium text-(--cv-chord)">Capo: {capo}. prag</p>
            )}
            {description.length > 0 && (
              <button
                type="button"
                onClick={() => setDescriptionOpen((v) => !v)}
                aria-expanded={descriptionOpen}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-(--cv-border) px-3 py-1 text-xs font-medium text-(--cv-text) hover:border-amber-400"
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
            <div className="mb-4 rounded-lg border border-(--cv-border) bg-(--cv-panel) p-3 text-[0.85em] text-(--cv-text)">
              {description.map((l, i) => renderLine(l, i, false))}
            </div>
          )}
          {body.map((l, i) => renderLine(l, i, true))}
        </div>
      </div>

      {!editing && <AutoScrollControl scrollRef={scrollRef} speedFactor={2.5} onPlayingChange={setFullscreen} />}
    </div>,
    document.body,
  );
}
