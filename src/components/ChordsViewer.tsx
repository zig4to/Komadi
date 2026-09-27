"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import AutoScrollControl from "@/components/AutoScrollControl";
import ChordDiagram from "@/components/ChordDiagram";
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
import { findChordShapes, loadChordDb, type ChordPosition } from "@/lib/chordShapes";
import { alignLyrics, fetchLrcCandidates, lineAt, pickCandidate, type LrcCandidate } from "@/lib/syncedLyrics";
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
const FLOATING_PLAYER_KEY = "komadi:chords:floatingPlayer";
// Izbrana različica prijema za vsak akord ({ "Dm": 1, … }).
const SHAPE_CHOICE_KEY = "komadi:chords:shapeChoice";
// Zamik besedila glede na video (s), na skladbo — video ima lahko daljši uvod.
const lrcOffsetKey = (id: string) => `komadi:chords:lrcOffset:${id}`;
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

  // Stran pod pregledovalnikom se ne pomika (in ne kaže svojega drsnika).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

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
    // Imena razdelkov (Intro, Chorus …): rumena kot ostali elementi; če so
    // rumeni tudi akordi, oranžna, da se ločijo od njih.
    "--cv-section":
      chordColor.label === "Rumena"
        ? theme.light ? "#c2410c" : "#fb923c"
        : theme.light ? "#b45309" : "#fbbf24",
  } as CSSProperties;

  // Izbirnik teme: fixed pod gumbom (vrstica z gumbi ima overflow-hidden).
  const [themeMenuPos, setThemeMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Razdelek "Napredne nastavitve" na dnu menija ⚙ (razprt/strnjen).
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Napredno: "Predvajalnik med pomikanjem" — med samodejnim pomikanjem desno
  // plavajoče kontrole glasbe (YouTubeMiniPlayer floatingHost). Globalno.
  const [floatingPlayer, setFloatingPlayer] = useState(() => readNumber(FLOATING_PLAYER_KEY, 0) === 1);
  useEffect(() => writeNumber(FLOATING_PLAYER_KEY, floatingPlayer ? 1 : 0), [floatingPlayer]);
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

  // Gumb celozaslonsko: skrije obe zgornji vrstici (kot med samodejnim
  // pomikanjem) in, kjer gre (Fullscreen API — ne npr. v iPhone Safariju),
  // še vrstico brskalnika/sistema. Izhod: gumb v kotu ali Nazaj.
  // Koren pregledovalnika — cilj portala za plavajoči predvajalnik.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => setRootEl(el), []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    // Izhod iz celozaslonskega načina brskalnika (npr. Android Nazaj) vrne vrstici.
    const onChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      // Ob zaprtju pregledovalnika ne ostani v celozaslonskem načinu.
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  const enterFullscreen = () => {
    closeThemeMenu();
    setIsFullscreen(true);
    // Cela stran, ne samo koren pregledovalnika: Android brskalniki (npr. Brave)
    // pri delu strani ne prilagodijo vedno vidnega območja.
    if (document.fullscreenEnabled) document.documentElement.requestFullscreen().catch(() => {});
  };
  const exitFullscreen = () => {
    setIsFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  useBackableOpen(isFullscreen, exitFullscreen);
  // Zgornji vrstici skrite: med samodejnim pomikanjem ali v celozaslonskem načinu.
  const barsHidden = fullscreen || isFullscreen;

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

  // "Pametni predvajalnik": med predvajanjem videa se pesem sama pomika na
  // vrstico, ki se trenutno poje (in jo poudari). Besedilo s časi iz LRCLIB
  // (src/lib/syncedLyrics.ts), prenese se enkrat na skladbo; brez njega ostane
  // ročni autoscroll.
  const [lrcCandidates, setLrcCandidates] = useState<LrcCandidate[] | null>(null);
  const [lrcError, setLrcError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLrcCandidates(song.id, song.title, song.author)
      .then((c) => {
        if (!cancelled) setLrcCandidates(c);
      })
      .catch((e: Error) => {
        if (!cancelled) setLrcError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [song.id, song.title, song.author]);
  const [videoDuration, setVideoDuration] = useState(0);
  const lrc = useMemo(() => (lrcCandidates ? pickCandidate(lrcCandidates, videoDuration) : null), [lrcCandidates, videoDuration]);
  const sync = useMemo(() => (lrc ? { ...alignLyrics(lrc.lines, body), total: lrc.lines.length } : null), [lrc, body]);
  const smartActive = !!sync && sync.points.length > 0;
  const [lrcOffset, setLrcOffset] = useState(() => readNumber(lrcOffsetKey(song.id), 0));
  useEffect(() => writeNumber(lrcOffsetKey(song.id), lrcOffset), [song.id, lrcOffset]);
  const [activeLine, setActiveLine] = useState(-1);
  const onVideoTime = (seconds: number, duration: number) => {
    if (duration && Math.abs(duration - videoDuration) > 1) setVideoDuration(duration);
    if (sync) setActiveLine(lineAt(sync.points, seconds - lrcOffset));
  };
  // Ročno pomikanje (dotik, kolesce) za 4 s ustavi samodejno sledenje.
  const lastUserScrollRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !smartActive) return;
    const mark = () => {
      lastUserScrollRef.current = Date.now();
    };
    el.addEventListener("touchstart", mark, { passive: true });
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("pointerdown", mark);
    return () => {
      el.removeEventListener("touchstart", mark);
      el.removeEventListener("wheel", mark);
      el.removeEventListener("pointerdown", mark);
    };
  }, [smartActive]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || activeLine < 0 || Date.now() - lastUserScrollRef.current < 4000) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!line) return;
    // Trenutna vrstica ~ tretjino od vrha vidnega dela.
    const top = el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeLine]);

  // Shema prijema ob prehodu z miško čez akord (na telefonu ob dotiku) —
  // kot na Ultimate Guitar. Vsak akord ima več različic (odprta, barre …),
  // med njimi puščici ‹ ›; izbira se zapomni za vsak akord (vse skladbe).
  const [shapeTip, setShapeTip] = useState<{
    name: string;
    positions: ChordPosition[];
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const [shapeChoice, setShapeChoice] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(SHAPE_CHOICE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SHAPE_CHOICE_KEY, JSON.stringify(shapeChoice));
    } catch {}
  }, [shapeChoice]);
  // Miška: okno ostane odprto, ko jo premakneš z akorda nanj (kratek zamik pri skrivanju).
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelHide = () => clearTimeout(hideTimerRef.current);
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => setShapeTip(null), 250);
  };
  useEffect(() => () => clearTimeout(hideTimerRef.current), []);
  const showShape = (name: string, el: HTMLElement) => {
    cancelHide();
    const r = el.getBoundingClientRect();
    loadChordDb().then((db) => {
      const positions = findChordShapes(db, name);
      if (!positions.length) return setShapeTip(null);
      // Nad akordom (spodnji rob okna 6 px nad njim); pod njim samo, če zgoraj ni prostora.
      const above = r.top > 180;
      setShapeTip({
        name,
        positions,
        left: Math.max(8, Math.min(r.left + r.width / 2 - 55, window.innerWidth - 118)),
        ...(above ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      });
    });
  };
  const shapeIndex = shapeTip ? Math.min(shapeChoice[shapeTip.name] ?? 0, shapeTip.positions.length - 1) : 0;
  const stepShape = (delta: number) => {
    if (!shapeTip) return;
    const n = shapeTip.positions.length;
    setShapeChoice((prev) => ({ ...prev, [shapeTip.name]: (shapeIndex + delta + n) % n }));
  };
  useEffect(() => {
    if (!shapeTip) return;
    // Dotik drugam ali pomikanje skrije shemo (telefon — tam ni "mouseleave").
    const hide = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.("[data-chord-name]")) setShapeTip(null);
    };
    const el = scrollRef.current;
    const onScroll = () => setShapeTip(null);
    document.addEventListener("pointerdown", hide);
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", hide);
      el?.removeEventListener("scroll", onScroll);
    };
  }, [shapeTip]);
  // Ime akorda (že transponirano/poenostavljeno) s shemo prijema.
  const chordName = (name: string) => (
    <span
      data-chord-name
      className="cursor-pointer"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") showShape(name, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") scheduleHide();
      }}
      onClick={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
        if (shapeTip?.name === name) setShapeTip(null);
        else showShape(name, e.currentTarget);
      }}
    >
      {name}
    </span>
  );

  // Ena vrstica pesmi ali opisa (glej ChordsLine v src/lib/chords.ts).
  // inBody: v pesmi (tablature skrite za gumbom "Tab"), sicer v opisu (vse vidno).
  const renderLine = (line: ChordsLine, i: number, inBody: boolean) => {
    if (line.kind === "section") {
      return (
        <div key={i} className="mt-3 flex items-center gap-2 font-sans font-semibold text-(--cv-section)">
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
              {chordName(c.name)}
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
                    {chordName(name)}
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
                    {chordName(c.name)}
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
                <span className="whitespace-pre font-bold text-(--cv-chord)">{name ? chordName(name) : " "}</span>
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
              {chordName(display(s.chord))}
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
    <div ref={setRoot} data-view-portal onClick={(e) => e.stopPropagation()} style={themeVars} className="fixed inset-0 z-50 flex flex-col bg-(--cv-bg) pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {/* Med samodejnim pomikanjem zgornji vrstici zdrsneta gor (celozaslonski
          način), ob pavzi se vrneta. Skrito s CSS, ne odstranjeno — predvajalnik
          mora ostati, da glasba igra naprej. */}
      <div
        className="grid shrink-0"
        style={{ gridTemplateRows: barsHidden ? "0fr" : "1fr", transition: `grid-template-rows ${BARS_TRANSITION}` }}
        aria-hidden={barsHidden}
      >
      <div
        className="min-h-0 overflow-hidden"
        // Brez transform: ta bi fixed sličico YouTube videa (znotraj vrstice) ujel v ta okvir.
        style={{ opacity: barsHidden ? 0 : 1, transition: `opacity ${BARS_TRANSITION}` }}
      >
      <div className="flex shrink-0 items-center justify-between gap-3 bg-neutral-900 px-4 py-2 lg:px-16">
        {videoIds.length > 0 ? <YouTubeMiniPlayer
            videoIds={videoIds}
            watchUrl={watchUrl ?? `https://www.youtube.com/watch?v=${videoIds[0]}`}
            floatingHost={floatingPlayer && fullscreen ? rootEl : null}
            onTime={onVideoTime}
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

      <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 border-b border-neutral-800 bg-neutral-900/80 px-3 py-1.5 lg:px-16">
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
          Simpl
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
          aria-label="Nastavitve"
          title="Nastavitve"
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-orange-400 transition active:scale-95 ${
            themeMenuPos ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={enterFullscreen}
          aria-label="Celozaslonski način"
          title="Celozaslonski način"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-400 text-neutral-200 transition hover:text-white active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      </div>
      </div>
      </div>

      {isFullscreen && (
        <button
          type="button"
          onClick={exitFullscreen}
          aria-label="Izhod iz celozaslonskega načina"
          title="Izhod iz celozaslonskega načina"
          className="fixed right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-orange-400 bg-neutral-900/70 text-amber-400 backdrop-blur active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
      )}

      {themeMenuPos && (
        <div
          ref={themeMenuRef}
          role="dialog"
          aria-label="Nastavitve"
          style={{ top: themeMenuPos.top, left: themeMenuPos.left }}
          className="fixed z-10 w-56 space-y-3 rounded-xl border border-orange-400 bg-neutral-900 p-3 shadow-xl"
        >
          <button
            type="button"
            onClick={() => {
              if (!editing) return startEdit();
              closeThemeMenu();
              cancelEdit();
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-left text-xs font-medium text-neutral-200 hover:border-orange-400 hover:text-white"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-400">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
            </svg>
            {editing ? "Zapri urejanje" : "Uredi besedilo in akorde"}
          </button>
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
          <div className="border-t border-neutral-700 pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-xs font-medium text-neutral-200 hover:text-white"
            >
              Napredne nastavitve
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-amber-400 transition ${advancedOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {/* Prostor za napredne nastavitve (dodane kasneje). */}
            {advancedOpen && (
              <div className="space-y-2 px-1 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-200">
                    Predvajalnik med pomikanjem
                    <span className="block text-[10px] leading-tight text-neutral-500">Glasba desno med samodejnim pomikanjem</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={floatingPlayer}
                    aria-label="Predvajalnik med pomikanjem"
                    onClick={() => setFloatingPlayer((v) => !v)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${floatingPlayer ? "bg-orange-400" : "bg-neutral-600"}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${floatingPlayer ? "translate-x-4" : ""}`}
                    />
                  </button>
                </div>
                <div className="border-t border-neutral-700 pt-2">
                  <span className="text-xs text-neutral-200">Pametni predvajalnik</span>
                  <span className="block text-[10px] leading-tight text-neutral-500">
                    {lrcError
                      ? `Napaka: ${lrcError}`
                      : !lrcCandidates
                        ? "Iščem besedilo s časi …"
                        : !sync
                          ? "Za to skladbo ni besedila s časi."
                          : `${lrc?.album || "Besedilo"}: povezanih ${sync.matched}/${sync.total} vrstic. Pritisni ▶ zgoraj.`}
                  </span>
                  {smartActive && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-neutral-300">Zamik besedila</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setLrcOffset((o) => Math.round((o - 0.5) * 10) / 10)}
                          className="rounded-full border border-orange-400 px-2 text-xs text-amber-400"
                        >
                          −0,5 s
                        </button>
                        <span className="w-10 text-center text-[11px] tabular-nums text-neutral-300">
                          {lrcOffset > 0 ? "+" : ""}
                          {lrcOffset.toFixed(1).replace(".", ",")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLrcOffset((o) => Math.round((o + 0.5) * 10) / 10)}
                          className="rounded-full border border-orange-400 px-2 text-xs text-amber-400"
                        >
                          +0,5 s
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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

      <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto px-4 pb-32 pt-4 [scrollbar-width:none] lg:px-16 [&::-webkit-scrollbar]:hidden ${editing ? "hidden" : ""}`}>
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
          {body.map((l, i) => (
            // data-line: cilj "Pametnega predvajalnika"; trenutna vrstica poudarjena.
            <div
              key={i}
              data-line={i}
              className={
                smartActive && i === activeLine
                  ? "-mx-1 rounded-md bg-[color-mix(in_srgb,var(--cv-section)_18%,transparent)] px-1 transition-colors"
                  : "transition-colors"
              }
            >
              {renderLine(l, i, true)}
            </div>
          ))}
        </div>
      </div>

      {shapeTip && (
        <div
          data-chord-name
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") cancelHide();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleHide();
          }}
          style={{ left: shapeTip.left, top: shapeTip.top, bottom: shapeTip.bottom }}
          className="fixed z-20 rounded-xl border border-orange-400 bg-(--cv-panel) px-2 pb-1 pt-1.5 shadow-xl"
        >
          <ChordDiagram name={shapeTip.name} position={shapeTip.positions[shapeIndex]} />
          {shapeTip.positions.length > 1 && (
            <div className="flex items-center justify-between font-sans">
              <button
                type="button"
                onClick={() => stepShape(-1)}
                aria-label="Prejšnja različica prijema"
                title="Prejšnja različica"
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-(--cv-chord) hover:bg-orange-400/15 active:scale-95"
              >
                ‹
              </button>
              <span className="text-[10px] tabular-nums text-(--cv-muted)">
                {shapeIndex + 1}/{shapeTip.positions.length}
              </span>
              <button
                type="button"
                onClick={() => stepShape(1)}
                aria-label="Naslednja različica prijema"
                title="Naslednja različica"
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-(--cv-chord) hover:bg-orange-400/15 active:scale-95"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* Med pametnim sledenjem ni ročnega autoscrolla — ne bi se smela tepsti. */}
      {!editing && !smartActive && <AutoScrollControl scrollRef={scrollRef} speedFactor={2.5} onPlayingChange={setFullscreen} />}
    </div>,
    document.body,
  );
}
