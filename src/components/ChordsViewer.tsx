"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import AutoScrollControl from "@/components/AutoScrollControl";
import ChordDiagram from "@/components/ChordDiagram";
import YouTubeMiniPlayer, { youTubeVideoId, type PlayerController } from "@/components/YouTubeMiniPlayer";
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
import {
  alignLyrics,
  chordAt,
  flattenChordSections,
  fetchLrcCandidates,
  lineProgressAt,
  instrumentalPoints,
  recordableLineIndexes,
  manualSyncPoints,
  pickBestCandidate,
  type LrcCandidate,
} from "@/lib/syncedLyrics";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { ChordSection, Song } from "@/types/song";
import { anchorScrollTop, computeAnchor, type LocalView } from "@/lib/sharedChordsView";

// Skupni pogled v Skupnem Jamu (Dashboard.tsx, src/lib/sharedChordsView.ts):
// vodja sporoča, kar vidi; sledilec prikaže vodjev pogled; "paused" = sledilec,
// ki je sledenje ustavil.
export type SharedViewProp =
  | { role: "leader"; onLocalView: (view: LocalView) => void }
  | { role: "follower"; leaderName: string; remote: LocalView | null; onStopFollowing: () => void }
  | { role: "paused"; leaderName: string; onFollow: () => void };

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
// Zamik besedila glede na video (s), za vsak posnetek posebej — drug video
// iste skladbe ima lahko drugačen uvod. Glavni zapis je songs.lrc_offsets
// ({ videoId: s }, vse naprave); localStorage je rezerva, dokler migracija
// 0028 ni pognana.
// Korak zamika (s).
const LRC_OFFSET_STEP = 0.25;
// m:ss za časovni razpon instrumentalnega dela.
const formatSec = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
// Id novega instrumentalnega dela (klicano samo iz dogodkov).
const newSectionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}`;
// Smart play označi tudi instrumentalne dele (intro, solo …) med premori v
// petju — test samo na teh skladbah.
const INSTRUMENTAL_TEST_TITLES = ["water witch"];
const lrcOffsetsKey = (id: string) => `komadi:chords:lrcOffsets:${id}`;
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

export default function ChordsViewer({
  song,
  onClose,
  shared,
}: {
  song: Song;
  onClose: () => void;
  shared?: SharedViewProp;
}) {
  const follower = shared?.role === "follower" ? shared : null;
  const [followPillHidden, setFollowPillHidden] = useState(false);
  const isFollowing = !!follower;
  useEffect(() => {
    if (!isFollowing) return;
    const t = setTimeout(() => setFollowPillHidden(true), 5000);
    return () => clearTimeout(t);
  }, [isFollowing]);
  // Po skritju napisa ✕ pomeni "Ne sledi" (zapre akorde, sledenje se ustavi).
  const closeAsUnfollow = isFollowing && followPillHidden;
  const remote = follower?.remote ?? null;
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
        // Izbran v izbirniku posnetka (shranjen v bazi, velja na vseh napravah).
        song.preferred_video_id,
        remembered,
        youTubeVideoId(song.youtube_url),
        youTubeVideoId(song.youtube_music_url),
        ...(song.youtube_embed_ids ?? []),
      ]),
    ].filter((id): id is string => Boolean(id));
  });

  const [preferredVideo, setPreferredVideo] = useState(song.preferred_video_id ?? null);

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
  // Telefon: vrstica samo za drsnik po skladbi (YouTubeMiniPlayer sliderHost).
  const [sliderHostEl, setSliderHostEl] = useState<HTMLDivElement | null>(null);
  const setSliderHost = useCallback((el: HTMLDivElement | null) => setSliderHostEl(el), []);
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
  const barsHidden = fullscreen || isFullscreen || !!remote?.fullscreen;

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
  // Različica z najboljšo povezavo z akordi, nato najbližja dolžini videa.
  const lrc = useMemo(
    () => (lrcCandidates ? pickBestCandidate(lrcCandidates, videoDuration, body) : null),
    [lrcCandidates, videoDuration, body],
  );
  // Ročno posneti časi (songs.synced_lines) imajo prednost pred LRCLIB.
  const [syncedLines, setSyncedLines] = useState(song.synced_lines ?? null);
  const sync = useMemo(() => {
    if (syncedLines?.points.length) {
      const points = manualSyncPoints(syncedLines.points);
      return { points, matched: points.length, total: points.length, manual: true };
    }
    if (!lrc) return null;
    const aligned = alignLyrics(lrc.lines, body);
    const points = INSTRUMENTAL_TEST_TITLES.includes(song.title.trim().toLowerCase())
      ? [...aligned.points, ...instrumentalPoints(aligned.points, lrc.lines, body)].sort((a, b) => a.time - b.time)
      : aligned.points;
    return { points, matched: aligned.matched, total: lrc.lines.filter((l) => l.text).length, manual: false };
  }, [syncedLines, lrc, body, song.title]);
  // Ročno posneti časi posameznih akordov (songs.synced_chords) — dodatna
  // plast: ob času se obarva prav ta akord (intro, solo …).
  // Razdeljeno na instrumentalne dele (Intro, Instrumental 1 …), vsak s svojim zamikom.
  const [syncedChords, setSyncedChords] = useState(song.synced_chords?.sections ? song.synced_chords : null);
  const chordPoints = useMemo(() => flattenChordSections(syncedChords?.sections ?? []), [syncedChords]);
  const [activeChord, setActiveChord] = useState<{ line: number; chord: number } | null>(null);
  // Na voljo, če je besedilo s časi ali posneti akordi; sledi pa samo po
  // gumbu "Smart play" (navadni ▶ samo predvaja, kot prej).
  const smartAvailable = (!!sync && sync.points.length > 0) || chordPoints.length > 0;
  const [smartOn, setSmartOn] = useState(false);
  const smartActive = smartAvailable && smartOn;
  // Posnetek, ki trenutno igra (onPlaying) — zamik velja zanj.
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [lrcOffsets, setLrcOffsets] = useState<Record<string, number>>(() => {
    let local: Record<string, number> = {};
    try {
      local = JSON.parse(window.localStorage.getItem(lrcOffsetsKey(song.id)) ?? "{}");
    } catch {}
    return { ...local, ...(song.lrc_offsets ?? {}) };
  });
  // Računalnik: gumbi za zamik v vrstici se razprejo šele ob kliku na "Zamik".
  const [offsetOpen, setOffsetOpen] = useState(false);
  const lrcOffset = playingVideo ? (lrcOffsets[playingVideo] ?? 0) : 0;
  const [lrcOffsetError, setLrcOffsetError] = useState<string | null>(null);
  const saveOffsetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(saveOffsetTimerRef.current), []);
  // Vsak klik takoj velja; v bazo gre 0,7 s po zadnjem (več klikov = en zapis).
  const changeLrcOffset = (delta: number) => {
    if (!playingVideo) return;
    const next = { ...lrcOffsets, [playingVideo]: Math.round((lrcOffset + delta) * 4) / 4 };
    setLrcOffsets(next);
    try {
      window.localStorage.setItem(lrcOffsetsKey(song.id), JSON.stringify(next));
    } catch {}
    clearTimeout(saveOffsetTimerRef.current);
    saveOffsetTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("songs").update({ lrc_offsets: next }).eq("id", song.id);
      setLrcOffsetError(error ? error.message : null);
    }, 700);
  };
  const [activeLine, setActiveLine] = useState(-1);
  // Telefon, med pavzo: tap na vrstico skoči tja in predvaja naprej.
  const playerCtlRef = useRef<PlayerController | null>(null);
  const playbackRef = useRef({ time: 0, playing: false });
  // "Posnemi čase": med predvajanjem uporabnik tapne ob začetku vsake zapete
  // vrstice; cursor = vrstica (indeks v body), ki jo naslednji tap označi.
  // Tap na vrstico v besedilu premakne cursor (npr. nazaj na refren, ki se
  // ponovi, a je v akordih zapisan enkrat).
  // Z besedilom in instrumentalne (samo akordi) — tudi intro/solo dobita tap.
  const lyricLines = useMemo(() => recordableLineIndexes(body), [body]);
  // Snemalnik: vrstice (TAP) + akordi, razdeljeni na instrumentalne dele.
  // Začne se z že shranjenim (intro danes, solo drugič). history = dejanja
  // tega snemanja, da ↶ razveljavi zadnje (vrstico, akord ali Konec).
  type RecAction =
    | { kind: "line" }
    | { kind: "chord"; sectionId: string }
    | { kind: "end"; sectionId: string; prev: number | null };
  const [recorder, setRecorder] = useState<{
    lines: { t: number; line: number }[];
    cursor: number;
    sections: ChordSection[];
    activeId: string | null;
    history: RecAction[];
    dirty: boolean;
  } | null>(null);
  const [recorderMsg, setRecorderMsg] = useState<string | null>(null);
  const [recorderSaving, setRecorderSaving] = useState(false);
  const nextLyricLine = (from: number) => lyricLines.find((i) => i >= from) ?? -1;
  const startRecorder = () => {
    const lines = [...(syncedLines?.points ?? [])].sort((a, b) => a.t - b.t);
    const sections = syncedChords?.sections ?? [];
    const lastLine = lines[lines.length - 1];
    setRecorder({
      lines,
      cursor: lastLine ? nextLyricLine(lastLine.line + 1) : (lyricLines[0] ?? -1),
      sections,
      activeId: sections[sections.length - 1]?.id ?? null,
      history: [],
      dirty: false,
    });
    setSmartOn(false);
    setRecorderMsg(
      "Zaženi ▶. TAP = začetek označene vrstice. Za instrumentalni del izberi (ali dodaj) del desno in klikaj akorde, ko zazvenijo.",
    );
    closeThemeMenu();
  };
  // Privzeto ime: prvi del "Intro", nato "Instrumental 1", "Instrumental 2" …
  const defaultSectionName = (sections: ChordSection[]) =>
    sections.length === 0 ? "Intro" : `Instrumental ${sections.filter((s) => s.name !== "Intro").length + 1}`;
  const addSection = () => {
    if (!recorder) return;
    const section: ChordSection = { id: newSectionId(), name: defaultSectionName(recorder.sections), offset: 0, end: null, points: [] };
    setRecorder({ ...recorder, sections: [...recorder.sections, section], activeId: section.id, dirty: true });
  };
  const updateSection = (id: string, change: (s: ChordSection) => ChordSection) => {
    if (!recorder) return;
    setRecorder({ ...recorder, sections: recorder.sections.map((s) => (s.id === id ? change(s) : s)), dirty: true });
  };
  const renameSection = (id: string) => {
    const current = recorder?.sections.find((s) => s.id === id);
    const name = current && window.prompt("Ime dela", current.name)?.trim();
    if (name) updateSection(id, (s) => ({ ...s, name }));
  };
  const deleteSection = (id: string) => {
    if (!recorder) return;
    const section = recorder.sections.find((s) => s.id === id);
    if (section?.points.length && !window.confirm(`Izbrišem del "${section.name}" (${section.points.length} akordov)?`)) return;
    const sections = recorder.sections.filter((s) => s.id !== id);
    setRecorder({
      ...recorder,
      sections,
      activeId: recorder.activeId === id ? (sections[sections.length - 1]?.id ?? null) : recorder.activeId,
      history: recorder.history.filter((a) => a.kind === "line" || a.sectionId !== id),
      dirty: true,
    });
  };
  // Pregled dela: predvajaj od 2 s pred njegovim prvim akordom.
  const previewSection = (section: ChordSection) => {
    if (!section.points.length) return;
    const start = Math.min(...section.points.map((p) => p.t)) + section.offset;
    if (!playerCtlRef.current?.seekAndPlay(Math.max(0, start - 2)))
      setRecorderMsg("Najprej enkrat zaženi posnetek z ▶.");
  };
  // Točen čas predvajalnika; null (+ opozorilo), če posnetek ne igra.
  const recordTime = () => {
    const t = playerCtlRef.current?.currentTime();
    if (t == null || !playbackRef.current.playing) {
      setRecorderMsg("Najprej zaženi posnetek z ▶.");
      return null;
    }
    setRecorderMsg(null);
    return Math.round(t * 100) / 100;
  };
  const recordTap = () => {
    if (!recorder || recorder.cursor < 0) return;
    const t = recordTime();
    if (t == null) return;
    setRecorder({
      ...recorder,
      lines: [...recorder.lines, { t, line: recorder.cursor }],
      cursor: nextLyricLine(recorder.cursor + 1),
      history: [...recorder.history, { kind: "line" }],
      dirty: true,
    });
  };
  // Klik na akord: v aktivni del (brez njega se ustvari "Intro").
  const recordChord = (line: number, chord: number) => {
    if (!recorder) return;
    const t = recordTime();
    if (t == null) return;
    let sections = recorder.sections;
    let activeId = recorder.activeId;
    if (!activeId || !sections.some((s) => s.id === activeId)) {
      const section: ChordSection = { id: newSectionId(), name: defaultSectionName(sections), offset: 0, end: null, points: [] };
      sections = [...sections, section];
      activeId = section.id;
    }
    // Čas brez zamika dela — tako se ob pregledu obarva natanko ob kliku.
    const id = activeId;
    setRecorder({
      ...recorder,
      sections: sections.map((s) => (s.id === id ? { ...s, points: [...s.points, { t: t - s.offset, line, chord }] } : s)),
      activeId: id,
      history: [...recorder.history, { kind: "chord", sectionId: id }],
      dirty: true,
    });
  };
  // "Konec" aktivnega dela: od tu ni obarvan noben akord (začetek petja, premor).
  const recordStop = () => {
    const section = recorder?.sections.find((s) => s.id === recorder.activeId);
    if (!recorder || !section) return;
    const t = recordTime();
    if (t == null) return;
    setRecorder({
      ...recorder,
      sections: recorder.sections.map((s) => (s.id === section.id ? { ...s, end: t - s.offset } : s)),
      history: [...recorder.history, { kind: "end", sectionId: section.id, prev: section.end }],
      dirty: true,
    });
  };
  // Vrstica, ki je ne želiš označiti (npr. ponovljeni takti): brez tapa naprej.
  const skipLine = () => {
    if (!recorder || recorder.cursor < 0) return;
    setRecorder({ ...recorder, cursor: nextLyricLine(recorder.cursor + 1) });
  };
  const undoTap = () => {
    const last = recorder?.history[recorder.history.length - 1];
    if (!recorder || !last) return;
    const history = recorder.history.slice(0, -1);
    if (last.kind === "line") {
      const removed = recorder.lines[recorder.lines.length - 1];
      setRecorder({ ...recorder, lines: recorder.lines.slice(0, -1), cursor: removed?.line ?? recorder.cursor, history });
      return;
    }
    setRecorder({
      ...recorder,
      sections: recorder.sections.map((s) =>
        s.id !== last.sectionId ? s : last.kind === "chord" ? { ...s, points: s.points.slice(0, -1) } : { ...s, end: last.prev },
      ),
      activeId: last.sectionId,
      history,
    });
  };
  // Osnutek med snemanjem: obarvanje po vseh delih (za pregled z ▶) in
  // podčrtani akordi aktivnega dela.
  const draftChordPoints = useMemo(() => flattenChordSections(recorder?.sections ?? []), [recorder]);
  const recordedChords = useMemo(() => {
    const active = recorder?.sections.find((s) => s.id === recorder.activeId);
    return new Set(active?.points.map((p) => `${p.line}:${p.chord}`) ?? []);
  }, [recorder]);
  const saveRecorder = async () => {
    if (!recorder?.dirty || !playingVideo) return;
    const linePoints = [...recorder.lines].sort((a, b) => a.t - b.t);
    const sections = recorder.sections.filter((s) => s.points.length);
    // Shrani samo plasti, ki imajo točke (ali so jih imele): Water Witch s
    // samimi akordi pusti vrstice iz LRCLIB pri miru.
    const nextLines = linePoints.length ? { videoId: syncedLines?.videoId ?? playingVideo, points: linePoints } : null;
    const nextChords = sections.length ? { videoId: syncedChords?.videoId ?? playingVideo, sections } : null;
    const update: Record<string, unknown> = {};
    if (nextLines || syncedLines) update.synced_lines = nextLines;
    if (nextChords || syncedChords) update.synced_chords = nextChords;
    setRecorderSaving(true);
    const { error } = await supabase.from("songs").update(update).eq("id", song.id);
    setRecorderSaving(false);
    if (error) {
      setRecorderMsg(`Shranjevanje ni uspelo: ${error.message}`);
      return;
    }
    if ("synced_lines" in update) setSyncedLines(nextLines);
    if ("synced_chords" in update) setSyncedChords(nextChords);
    setRecorder(null);
    setRecorderMsg(null);
    setSmartOn(true);
  };
  const deleteSyncedLines = async () => {
    if (!window.confirm("Izbrišem ročno posnete čase (vrstice in akorde) za to skladbo?")) return;
    const { error } = await supabase.from("songs").update({ synced_lines: null, synced_chords: null }).eq("id", song.id);
    if (error) window.alert(`Brisanje ni uspelo: ${error.message}`);
    else {
      setSyncedLines(null);
      setSyncedChords(null);
    }
  };

  const seekToLine = (lineIndex: number, e: React.MouseEvent) => {
    if (recorder) {
      if ((e.target as HTMLElement).closest("[data-chord-name],button,a")) return;
      const line = nextLyricLine(lineIndex);
      if (line >= 0 && line <= lineIndex + 3) setRecorder({ ...recorder, cursor: line });
      return;
    }
    if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
    if (!sync || playbackRef.current.playing) return;
    // Tap na akord (shema), gumb ali povezavo ne premika predvajanja.
    if ((e.target as HTMLElement).closest("[data-chord-name],button,a")) return;
    // Vrstica brez besedila (akordi, naslov razdelka): prva naslednja z besedilom.
    let target = -1;
    for (let i = lineIndex; i <= lineIndex + 3 && target < 0; i++) if (sync.points.some((p) => p.lineIndex === i)) target = i;
    if (target < 0) return;
    // Ponovljena vrstica (refren, v akordih zapisan enkrat): ponovitev,
    // časovno najbližja trenutnemu mestu; začetek njenega razpona.
    const now = playbackRef.current.time - lrcOffset;
    let best = -1;
    sync.points.forEach((p, k) => {
      if (p.lineIndex !== target) return;
      if (best < 0 || Math.abs(p.time - now) < Math.abs(sync.points[best].time - now)) best = k;
    });
    while (best > 0 && sync.points[best - 1].lineIndex === target) best--;
    if (playerCtlRef.current?.seekAndPlay(sync.points[best].time + lrcOffset - 0.3)) {
      setSmartOn(true);
      lastUserScrollRef.current = 0;
    }
  };
  const onVideoTime = (seconds: number, duration: number, playing: boolean) => {
    playbackRef.current = { time: seconds, playing };
    if (duration && Math.abs(duration - videoDuration) > 1) setVideoDuration(duration);
    setActiveLine(smartActive && sync ? lineProgressAt(sync.points, seconds - lrcOffset).lineIndex : -1);
    // Akordi: čas posnetka brez zamika LRC (vsak del ima svoj zamik); med
    // snemanjem po osnutku, da se pregled z ▶ takoj vidi.
    const pts = recorder ? draftChordPoints : smartActive ? chordPoints : [];
    const chord = pts.length ? chordAt(pts, seconds) : null;
    setActiveChord((prev) => (prev?.line === chord?.line && prev?.chord === chord?.chord ? prev : chord));
  };
  // Pomik: aktivni akord (intro, solo …) ima prednost pred vrstico.
  const leaderReport = shared?.role === "leader" ? shared.onLocalView : null;
  const leaderReportRef = useRef(leaderReport);
  const leaderViewRef = useRef<Omit<LocalView, "anchor">>({ smart: null, fullscreen: false });
  useEffect(() => {
    leaderReportRef.current = leaderReport;
    leaderViewRef.current = {
      smart: smartActive ? { line: activeLine, chord: activeChord } : null,
      fullscreen: barsHidden,
    };
  });
  const reportView = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !leaderReportRef.current) return;
    leaderReportRef.current({ anchor: computeAnchor(el), ...leaderViewRef.current });
  }, []);
  const isLeader = !!leaderReport;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isLeader) return;
    el.addEventListener("scroll", reportView, { passive: true });
    reportView();
    return () => el.removeEventListener("scroll", reportView);
  }, [isLeader, reportView]);
  useEffect(() => {
    if (isLeader) reportView();
  }, [isLeader, reportView, smartActive, activeLine, activeChord, barsHidden]);
  // Sledilec: na vrhu ista vrstica kot pri vodji.
  const remoteAnchorKey = remote ? `${remote.anchor.line}:${remote.anchor.frac}` : "";
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !remote) return;
    const top = anchorScrollTop(el, remote.anchor);
    if (top != null && Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteAnchorKey, fontSize]);
  // Vodja izstopi iz celozaslonskega načina → tudi sledilec (če je vstopil).
  const remoteFullscreen = !!remote?.fullscreen;
  useEffect(() => {
    if (!remoteFullscreen && follower && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [remoteFullscreen, follower]);
  const scrollLine = follower ? -1 : activeChord ? activeChord.line : activeLine;
  // Kar je označeno: pri sledilcu vodjev Smart play, sicer lasten.
  const shownLine = follower ? (remote?.smart?.line ?? -1) : smartActive ? activeLine : -1;
  const shownChord = follower ? (remote?.smart?.chord ?? null) : activeChord;
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
    if (!el || scrollLine < 0 || Date.now() - lastUserScrollRef.current < 4000) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${scrollLine}"]`);
    if (!line) return;
    // Trenutna vrstica ~ tretjino od vrha vidnega dela.
    const top = el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [scrollLine]);

  // Snemanje časov: vrstica, ki jo naslednji tap označi, ~ tretjino od vrha.
  const recorderCursor = recorder?.cursor ?? -1;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || recorderCursor < 0) return;
    const line = el.querySelector<HTMLElement>(`[data-line="${recorderCursor}"]`);
    if (!line) return;
    const top = el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [recorderCursor]);
  // Računalnik: preslednica = TAP, Backspace = razveljavi zadnji tap.
  const recordTapRef = useRef(recordTap);
  const undoTapRef = useRef(undoTap);
  useEffect(() => {
    recordTapRef.current = recordTap;
    undoTapRef.current = undoTap;
  });
  const recording = !!recorder;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      // Fokusiran gumb (npr. TAP po kliku) preslednico sproži sam kot klik.
      if (e.code === "Space" && (e.target as HTMLElement).closest("button")) return;
      if (e.code === "Space") {
        e.preventDefault();
        recordTapRef.current();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undoTapRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);

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
  // Ime akorda (že transponirano/poenostavljeno) s shemo prijema. at = mesto
  // v telesu pesmi (vrstica, zaporedni akord v njej) — samo v telesu: med
  // snemanjem klik zapiše čas akorda, med Smart playem se obarva aktivni.
  const chordName = (name: string, at?: { line: number; chord: number }) => {
    const key = at ? `${at.line}:${at.chord}` : null;
    // activeChord: med Smart playem iz shranjenih delov, med snemanjem iz osnutka.
    const active = !!at && shownChord?.line === at.line && shownChord.chord === at.chord;
    const recorded = !!recorder && !!key && recordedChords.has(key);
    return (
      <span
        data-chord-name
        className={`cursor-pointer ${
          // Senca namesto odmika: obarvano ozadje brez premika postavitve.
          active ? "rounded-sm bg-orange-400 text-neutral-950 shadow-[0_0_0_2px_#fb923c]" : ""
        } ${recorded && !active ? "underline decoration-orange-400 decoration-dotted underline-offset-4" : ""}`}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && !recorder) showShape(name, e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleHide();
        }}
        onClick={(e) => {
          if (recorder) {
            if (at) recordChord(at.line, at.chord);
            return;
          }
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
          if (shapeTip?.name === name) setShapeTip(null);
          else showShape(name, e.currentTarget);
        }}
      >
        {name}
      </span>
    );
  };

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
              {chordName(c.name, inBody ? { line: i, chord: j } : undefined)}
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
                    {chordName(name, inBody ? { line: i, chord: j } : undefined)}
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
                    {chordName(c.name, inBody ? { line: i, chord: j } : undefined)}
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
                <span className="whitespace-pre font-bold text-(--cv-chord)">{name ? chordName(name, inBody ? { line: i, chord: j } : undefined) : " "}</span>
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
              {chordName(display(s.chord), inBody ? { line: i, chord: j } : undefined)}
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
        {/* Tudi brez kandidatov: v izbirniku posnetka lahko prilepiš povezavo. */}
        <YouTubeMiniPlayer
            videoIds={videoIds}
            watchUrl={
              watchUrl ??
              (videoIds[0]
                ? `https://www.youtube.com/watch?v=${videoIds[0]}`
                : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.author} ${song.title}`)}`)
            }
            floatingHost={floatingPlayer && fullscreen ? rootEl : null}
            sliderHost={sliderHostEl}
            onTime={onVideoTime}
            smartAvailable={smartAvailable}
            smartOn={smartOn}
            onSmartToggle={setSmartOn}
            controllerRef={playerCtlRef}
            preferredId={preferredVideo}
            onSelect={async (id) => {
              const prev = preferredVideo;
              setPreferredVideo(id);
              const { error } = await supabase.from("songs").update({ preferred_video_id: id }).eq("id", song.id);
              if (error) setPreferredVideo(prev);
              return error ? error.message : null;
            }}
            onPlaying={(id) => {
              setPlayingVideo(id);
              try {
                window.localStorage.setItem(workingVideoKey(song.id), id);
              } catch {}
            }}
          />
        <button
          type="button"
          onClick={onClose}
          aria-label={closeAsUnfollow ? "Ne sledi" : "Zapri"}
          title={closeAsUnfollow ? `Ne sledi več: ${follower?.leaderName}` : "Zapri"}
          className={
            closeAsUnfollow
              ? "flex shrink-0 items-center gap-1 rounded-full bg-fuchsia-600 py-1 pl-1.5 pr-2.5 text-xs font-medium text-white active:scale-95"
              : "shrink-0 p-1 text-neutral-300 hover:text-white"
          }
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={closeAsUnfollow ? "h-4 w-4" : "h-5 w-5"}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          {closeAsUnfollow && "Ne sledi"}
        </button>
      </div>

      {/* Telefon: drsnik po skladbi čez celo širino, med zgornjo vrstico in orodji. */}
      <div ref={setSliderHost} className="flex shrink-0 items-center bg-neutral-900 px-4 pb-2 empty:hidden lg:hidden" />

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
        {/* Računalnik: zamik Smart playa v vrstici (na telefonu v ⚙ → Napredne nastavitve). */}
        {smartAvailable && (
          <div
            className="hidden items-center rounded-full border border-orange-400 py-0.5 pl-2.5 pr-0.5 lg:flex"
            role="group"
            aria-label="Zamik besedila"
            title={playingVideo ? "Zamik besedila za posnetek, ki igra" : "Najprej zaženi predvajanje"}
          >
            <button
              type="button"
              onClick={() => setOffsetOpen((v) => !v)}
              aria-expanded={offsetOpen}
              className={`mr-0.5 flex h-7 items-center text-xs ${offsetOpen ? "text-neutral-400" : "pr-2 text-neutral-200 hover:text-white"}`}
            >
              Zamik
              {!offsetOpen && lrcOffset !== 0 && (
                <span className="ml-1 tabular-nums text-amber-400">
                  {lrcOffset > 0 ? "+" : ""}
                  {lrcOffset.toFixed(2).replace(".", ",")}
                </span>
              )}
            </button>
            {offsetOpen && (
              <>
                <button type="button" onClick={() => changeLrcOffset(-LRC_OFFSET_STEP)} disabled={!playingVideo} aria-label="Besedilo 0,25 s prej" title="Besedilo 0,25 s prej" className={toneButton}>
                  −
                </button>
                <span className="w-11 text-center text-xs tabular-nums text-neutral-200">
                  {lrcOffset > 0 ? "+" : ""}
                  {lrcOffset.toFixed(2).replace(".", ",")}
                </span>
                <button type="button" onClick={() => changeLrcOffset(LRC_OFFSET_STEP)} disabled={!playingVideo} aria-label="Besedilo 0,25 s pozneje" title="Besedilo 0,25 s pozneje" className={toneButton}>
                  +
                </button>
              </>
            )}
          </div>
        )}
        {/* Računalnik: "Posnemi čase" v vrstici (na telefonu v ⚙ → Napredne nastavitve). */}
        <button
          type="button"
          onClick={startRecorder}
          disabled={!!recorder}
          aria-pressed={!!recorder}
          title="Posnemi čase vrstic in akordov za Smart play"
          className={`hidden h-8 items-center gap-1.5 rounded-full border border-orange-400 px-3 text-xs transition active:scale-95 lg:flex ${
            recorder ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500" />
          {syncedLines || syncedChords ? "Nadaljuj snemanje" : "Posnemi čase"}
        </button>
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

      {closeAsUnfollow && barsHidden && !isFullscreen && (
        <button
          type="button"
          onClick={onClose}
          className="fixed right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-fuchsia-600/90 py-1 pl-1.5 pr-2.5 font-sans text-xs font-medium text-white backdrop-blur active:scale-95"
          style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Ne sledi
        </button>
      )}

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
                  {chordPoints.length > 0 && (
                    <span className="block text-[10px] leading-tight text-neutral-500">
                      Instrumentalni deli: {syncedChords?.sections.map((s) => s.name).join(", ")} (
                      {chordPoints.filter((p) => !("stop" in p)).length} akordov)
                    </span>
                  )}
                  <span className="block text-[10px] leading-tight text-neutral-500">
                    {sync?.manual
                      ? `Ročno posneti časi: ${sync.points.length} tapov. Zaženi z gumbom Smart play levo od ▶.`
                      : lrcError
                      ? `Napaka: ${lrcError}`
                      : !lrcCandidates
                        ? "Iščem besedilo s časi …"
                        : !sync
                          ? "Za to skladbo ni besedila s časi."
                          : `${lrc?.album || "Besedilo"}: povezanih ${sync.matched}/${sync.total} vrstic. Zaženi z gumbom Smart play levo od ▶.`}
                  </span>
                  {smartAvailable && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 lg:hidden">
                      <span className="text-[11px] text-neutral-300">
                        Zamik besedila
                        <span className="block text-[10px] leading-tight text-neutral-500">
                          {playingVideo ? "za posnetek, ki igra" : "najprej zaženi predvajanje"}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeLrcOffset(-LRC_OFFSET_STEP)}
                          disabled={!playingVideo}
                          className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                        >
                          −0,25 s
                        </button>
                        <span className="w-12 text-center text-[11px] tabular-nums text-neutral-300">
                          {lrcOffset > 0 ? "+" : ""}
                          {lrcOffset.toFixed(2).replace(".", ",")}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeLrcOffset(LRC_OFFSET_STEP)}
                          disabled={!playingVideo}
                          className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                        >
                          +0,25 s
                        </button>
                      </div>
                    </div>
                  )}
                  {(
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {/* Na računalniku je ta gumb v orodni vrstici. */}
                      <button
                        type="button"
                        onClick={startRecorder}
                        className="rounded-full border border-orange-400 px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:bg-orange-400/15 lg:hidden"
                      >
                        {syncedLines || syncedChords ? "Nadaljuj snemanje časov" : "Posnemi čase"}
                      </button>
                      {(syncedLines || syncedChords) && (
                        <button
                          type="button"
                          onClick={deleteSyncedLines}
                          className="rounded-full border border-neutral-600 px-2.5 py-1 text-[11px] text-neutral-300 hover:border-red-400 hover:text-red-400"
                        >
                          Izbriši posnete čase
                        </button>
                      )}
                    </div>
                  )}
                  {smartAvailable && lrcOffsetError && (
                    <span className="mt-1 block text-[10px] leading-tight text-red-400">
                      Zamik je shranjen samo v tem brskalniku ({lrcOffsetError}). Poženi migracijo 0028_add_lrc_offset.sql v Supabase.
                    </span>
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
              onClick={(e) => seekToLine(i, e)}
              className={
                i === shownLine || i === recorderCursor
                  ? "-ml-2 -mr-1 rounded-r-md bg-[color-mix(in_srgb,var(--cv-text)_8%,transparent)] pl-2 pr-1 shadow-[inset_1.5px_0_0_#fb923c] lg:w-fit lg:shadow-[inset_2px_0_0_#fb923c]"
                  : "-ml-2 -mr-1 pl-2 pr-1 lg:w-fit"
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

      {/* Telefon: pod pesmijo (v stolpcu, ne čez konec). Računalnik: plavajoče
          čez desno polovico — besedilo je poravnano levo in ostane vidno. */}
      {recorder && (
        <div
          className="relative z-30 shrink-0 border-t border-orange-400 bg-neutral-950/95 px-3 pt-2 font-sans text-neutral-100 backdrop-blur lg:fixed lg:bottom-0 lg:right-0 lg:w-1/2 lg:rounded-tl-xl lg:border-l"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-neutral-300">
              <span>
                Posnemi čase ·{" "}
                {recorder.cursor >= 0
                  ? `vrstica ${lyricLines.indexOf(recorder.cursor) + 1}/${lyricLines.length}`
                  : "konec besedila"}
              </span>
              <span className="hidden text-neutral-500 lg:inline">Preslednica = TAP · Backspace = nazaj · klik na akord = v izbrani del</span>
            </div>
            {recorderMsg && <p className="mb-2 text-xs text-amber-400">{recorderMsg}</p>}
            <div className="mb-2 flex items-stretch gap-1.5 text-sm">
              <button
                type="button"
                onClick={() => {
                  if (!recorder.dirty || window.confirm("Zavržem spremembe?")) {
                    setRecorder(null);
                    setRecorderMsg(null);
                  }
                }}
                className="rounded-xl border border-neutral-600 px-3 py-2 text-neutral-300 active:scale-95"
              >
                Prekliči
              </button>
              <button
                type="button"
                onClick={undoTap}
                disabled={!recorder.history.length}
                aria-label="Razveljavi zadnji zapis"
                className="rounded-xl border border-neutral-600 px-3 text-lg text-neutral-300 active:scale-95 disabled:opacity-40"
              >
                ↶
              </button>
              <button
                type="button"
                onClick={skipLine}
                disabled={recorder.cursor < 0}
                className="rounded-xl border border-neutral-600 px-3 text-neutral-300 active:scale-95 disabled:opacity-40"
              >
                Preskoči
              </button>
              <button
                type="button"
                onClick={recordStop}
                disabled={!recorder.activeId}
                title="Konec izbranega dela: od tu ni obarvan noben akord"
                className="rounded-xl border border-neutral-600 px-3 text-neutral-300 active:scale-95 disabled:opacity-40"
              >
                Konec
              </button>
              <button
                type="button"
                onClick={saveRecorder}
                disabled={!recorder.dirty || !playingVideo || recorderSaving}
                className="ml-auto rounded-xl border border-orange-400 px-3 font-semibold text-amber-400 active:scale-95 disabled:opacity-40"
              >
                {recorderSaving ? "…" : "Shrani"}
              </button>
            </div>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={recordTap}
                disabled={recorder.cursor < 0}
                className="w-2/5 shrink-0 rounded-xl bg-orange-500 py-4 text-lg font-bold tracking-wide text-white active:scale-[0.98] disabled:opacity-40"
              >
                TAP
                <span className="block text-[10px] font-medium tracking-normal opacity-80">vrstica</span>
              </button>
              {/* Instrumentalni deli: izbrani prejme klike na akorde. */}
              <div className="min-w-0 flex-1 rounded-xl border border-neutral-700 p-1">
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {recorder.sections.map((section) => {
                    const active = section.id === recorder.activeId;
                    const times = section.points.map((p) => p.t + section.offset);
                    const from = times.length ? Math.min(...times) : null;
                    const to = times.length
                      ? (section.end != null ? section.end + section.offset : Math.max(...times) + 4)
                      : null;
                    return (
                      <div
                        key={section.id}
                        className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] ${
                          active ? "border-orange-400 bg-orange-400/10" : "border-transparent bg-neutral-900"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setRecorder({ ...recorder, activeId: section.id })}
                          onDoubleClick={() => renameSection(section.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className={`block truncate font-semibold ${active ? "text-amber-400" : "text-neutral-100"}`}>
                            {section.name}
                          </span>
                          <span className="block truncate text-[10px] text-neutral-500">
                            {from != null && to != null ? `${formatSec(from)}–${formatSec(to)} · ` : ""}
                            {section.points.length} akordov
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => renameSection(section.id)}
                          aria-label={`Preimenuj ${section.name}`}
                          className="px-0.5 text-neutral-400 hover:text-white"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => previewSection(section)}
                          disabled={!section.points.length}
                          aria-label={`Predvajaj ${section.name}`}
                          className="px-0.5 text-amber-400 disabled:opacity-30"
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSection(section.id, (s) => ({ ...s, offset: Math.round((s.offset - LRC_OFFSET_STEP) * 4) / 4 }))}
                          aria-label="Zamik −0,25 s"
                          className="rounded border border-neutral-600 px-1 text-neutral-300"
                        >
                          −
                        </button>
                        <span className="w-9 text-center tabular-nums text-neutral-300">
                          {section.offset > 0 ? "+" : ""}
                          {section.offset.toFixed(2).replace(".", ",")}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateSection(section.id, (s) => ({ ...s, offset: Math.round((s.offset + LRC_OFFSET_STEP) * 4) / 4 }))}
                          aria-label="Zamik +0,25 s"
                          className="rounded border border-neutral-600 px-1 text-neutral-300"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSection(section.id)}
                          aria-label={`Izbriši ${section.name}`}
                          className="px-0.5 text-neutral-500 hover:text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addSection}
                  className="mt-1 w-full rounded-lg border border-dashed border-orange-400/60 py-1 text-[11px] font-medium text-amber-400 hover:bg-orange-400/10"
                >
                  + Nov del
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shared && shared.role !== "leader" && !(shared.role === "follower" && followPillHidden) && (
        <div
          className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-fuchsia-400/70 bg-neutral-950/90 py-1 pl-3 pr-1 font-sans text-xs text-neutral-100 shadow-lg backdrop-blur"
          style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
        >
          <span className="truncate">
            {shared.role === "follower" ? "Slediš: " : "Vodi: "}
            <span className="font-semibold text-fuchsia-300">{shared.leaderName}</span>
          </span>
          {shared.role === "follower" && remoteFullscreen && !isFullscreen && typeof document !== "undefined" && document.fullscreenEnabled && (
            <button
              type="button"
              onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
              className="rounded-full border border-orange-400 px-2 py-0.5 text-amber-400"
            >
              Celozaslonsko
            </button>
          )}
          <button
            type="button"
            onClick={shared.role === "follower" ? shared.onStopFollowing : shared.onFollow}
            className="rounded-full bg-fuchsia-600 px-2.5 py-0.5 font-medium text-white"
          >
            {shared.role === "follower" ? "Ne sledi" : "Sledi"}
          </button>
        </div>
      )}

      {/* Med pametnim sledenjem ni ročnega autoscrolla — ne bi se smela tepsti. */}
      {!editing && !smartActive && !recorder && !follower && <AutoScrollControl scrollRef={scrollRef} speedFactor={2.5} onPlayingChange={setFullscreen} />}
    </div>,
    document.body,
  );
}
