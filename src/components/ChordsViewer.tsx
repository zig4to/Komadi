"use client";

import { PATTERN_OPACITY_MAX, PatternSvg, scaledBackgroundColors } from "@/lib/backgroundPatterns";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import AutoScrollControl from "@/components/AutoScrollControl";
import ChordDiagram from "@/components/ChordDiagram";
import YouTubeMiniPlayer, { youTubeVideoId, type PlayerController, VOLUME_KEY, readVolume } from "@/components/YouTubeMiniPlayer";
import { enterLandscapeFullscreen, canBrowserFullscreen, hasSamSpili, isAppFullscreen, openChordsViewer } from "@/lib/openChords";
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
import { findChordShapes, loadChordDb, mergeShapes, parseDescriptionShapes, type ChordPosition } from "@/lib/chordShapes";
import {
  alignLyrics,
  chordAt,
  chordsAt,
  flattenChordSections,
  fetchLrcCandidates,
  lineProgressAt,
  instrumentalPoints,
  recordableLineIndexes,
  lineKey,
  manualSyncPoints,
  pickBestCandidate,
  rebaseSyncOnEdit,
  remapLines,
  type LrcCandidate,
  type SyncPoint, sectionOffset, instrumentalGapAt } from "@/lib/syncedLyrics";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { useMetronome } from "@/lib/useMetronome";
import ImproPanel from "@/components/ImproPanel";
import ChordQuiz from "@/components/ChordQuiz";
import { useIsDesktop } from "@/components/Scales";
import type { ChordSection, Song, SyncedChords, SyncedLines } from "@/types/song";
import { anchorScrollTop, computeAnchor, getRemoteView, subscribeRemoteView, type LocalView, type RemoteViewEntry, type SamSpiliView } from "@/lib/sharedChordsView";
import { BACKGROUNDS, BACKGROUND_ORDER } from "@/lib/backgrounds";
import { readFollowerLead } from "@/lib/followerLead";

// Skupni pogled v Skupnem Jamu (Dashboard.tsx, src/lib/sharedChordsView.ts):
// vodja sporoča, kar vidi; sledilec prikaže vodjev pogled; "paused" = sledilec,
// ki je sledenje ustavil.
export type SharedViewProp =
  | { role: "leader"; onLocalView: (view: LocalView) => void }
  // Vodjev pogled pride mimo propov (subscribeRemoteView v sharedChordsView.ts).
  | { role: "follower"; leaderName: string; onStopFollowing: () => void }
  | { role: "paused"; leaderName: string; onFollow: () => void };

// Vgrajen pregledovalnik akordov (v slogu UG Tabs app): songs.chords_text
// (UG markup) izrisan kot tekst — akordi nad besedilom, transpozicija,
// velikost pisave, samodejno pomikanje (AutoScrollControl). Dodatna možnost
// ob obstoječih povezavah/PDF v ChordsButtons.tsx, ne nadomestilo.

const FONT_KEY = "komadi:chords:font";
// Računalnik: ročna velikost orodne vrstice (zoom), samo ob odprtem Impro; brez
// ključa = samodejno. Brez Impro je velikost vedno samodejna (fitToolbar).
const TOOLBAR_SCALE_KEY = "komadi:chords:toolbarScaleImpro";
const TOOLBAR_SCALE_STEP = 0.05;
const TOOLBAR_SCALE_MIN = 0.6;
const TOOLBAR_SCALE_MAX = 2;
const TOOLBAR_COLLAPSED_KEY = "komadi:chords:toolbarCollapsed";
// Simplify: za vsako skladbo posebej (komadi:chords:simplify:<id>), kot transpozicija.
const SIMPLIFY_KEY = "komadi:chords:simplify";
// "Pokaži akorde": sheme vseh akordov skladbe desno od naslova (kot na UG).
const SHOW_SHAPES_KEY = "komadi:chords:showShapes";
// "No capo": skladbe s capom prikaže v akordih brez capa (prijemi + N poltonov). Globalno.
const NO_CAPO_KEY = "komadi:chords:noCapo";
// Okvir s prijemi (Posebni akordi / Akordi v skladbi) razprt (1) ali zložen (0) — globalno.
const SHAPES_OPEN_KEY = "komadi:chords:shapesOpen";
const BG_KEY = "komadi:chords:bg";
// "Sam Špili" ima svoje ozadje (privzeto Akordni diagram), ločeno od navadnega pogleda.
const SS_BG_KEY = "komadi:chords:ssBg";
// Vidnost vzorca ozadja (Plastnice, Vrat kitare …) v pregledovalniku in Sam Špili.
// Nov ključ (…2), da privzetih 350 % velja za vse, tudi za že shranjene izbire.
const PATTERN_OPACITY_KEY = "komadi:chords:patternOpacity2";
const DEFAULT_PATTERN_OPACITY = 3.5;
const CHORD_COLOR_KEY = "komadi:chords:chordColor";
const TEXT_COLOR_KEY = "komadi:chords:textColor";
const SECTION_COLOR_KEY = "komadi:chords:sectionColor";
const MARK_FILL_KEY = "komadi:chords:markFill";
// Barva črte ob trenutni vrstici (Smart play) in sij akordov — nastavita jih predefinirane teme.
const LINE_COLOR_KEY = "komadi:chords:lineColor";
const CHORD_GLOW_KEY = "komadi:chords:chordGlow";
const MARK_BORDER_KEY = "komadi:chords:markBorder";
const MARK_SHAPE_KEY = "komadi:chords:markShape";
const MARK_WIDTH_KEY = "komadi:chords:markWidth";
// Izbrana različica prijema za vsak akord ({ "Dm": 1, … }).
const SHAPE_CHOICE_KEY = "komadi:chords:shapeChoice";
// Zamik besedila glede na video (s), za vsak posnetek posebej — drug video
// iste skladbe ima lahko drugačen uvod. Glavni zapis je songs.lrc_offsets
// ({ videoId: s }, vse naprave); localStorage je rezerva, dokler migracija
// 0028 ni pognana.
// Korak zamika (s).
const LRC_OFFSET_STEP = 0.25;
// Napredno: "Podčrtani akordi" — izklop označevanja akordov v zapetih vrsticah
// (intro/solo ostanejo). Globalno, na tej napravi.
const SUNG_CHORDS_KEY = "komadi:chords:sungChords";
// m:ss za časovni razpon instrumentalnega dela.
const formatSec = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
// Navaden durov/molov trozvok (A, Am, Cm, Bbm, F# … tudi kot barre); vse ostalo
// (/bas, add, sus, 7, maj7, 6, dim …) je "posebni akord", prikazan na vrhu skladbe.
const isBasicChord = (name: string) => /^[A-H][#b]?m?$/.test(name.replace(/\*+$/, ""));
// "1 akord", "2 akorda", "3 akordi", "5 akordov" (slovenska dvojina/množina).
const chordCountLabel = (n: number) => {
  const m = n % 100;
  return `${n} ${m === 1 ? "akord" : m === 2 ? "akorda" : m === 3 || m === 4 ? "akordi" : "akordov"}`;
};
// "1:27,96" — čas posameznega akorda pri tapkanju (na stotinko).
const formatSecFine = (s: number) => {
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, "0").replace(".", ",")}`;
};
// Id novega instrumentalnega dela (klicano samo iz dogodkov).
const newSectionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}`;
// Smart play označi tudi instrumentalne dele (intro, solo …) med premori v
// petju — test samo na teh skladbah.
const INSTRUMENTAL_TEST_TITLES = ["water witch"];
// "Sam Špili": odmik besedila od oranžne črte (poudarek vrstice).
const SS_LINE_INSET = { marginLeft: "-0.45em", paddingLeft: "0.45em" } as const;
// "Sam Špili": koliko (tipičnih) vrstic nad trenutno ostane vidnih ob njenem začetku
// — najmanj; pri manjši pisavi (več vrstic na zaslonu) velja SS_CENTER.
const SS_SLOT_ROWS = 1.4;
// "Sam Špili": sredina trenutne vrstice (na polovici njenega napredka) na tem
// deležu višine okvirja — bližje sredini zaslona.
const SS_CENTER = 0.4;
// "Sam Špili": premor v petju (s), ki šteje kot instrumentalni del — poudarek se ugasne.
const SS_GAP_MIN = 4;
// "Sam Špili": ročni pomik (prst/kolešček) ustavi sledenje; po toliko ms brez
// dotika se pogled vrne k skladbi.
const SS_USER_HOLD = 3000;
// Ojačanje ročnega pomika (prst ×, kolešček ×) — velika pisava, malo prostora.
const SS_DRAG_GAIN = 1;
const SS_WHEEL_GAIN = 1;
// "Sam Špili" — test enakomernega pomikanja (kot autoscroll): položaj ni več
// vrstica + napredek, ampak krivulja skozi začetke zapetih vrstic, zglajena z
// drsečim povprečjem SS_SMOOTH_SEC s — brez ustavljanja po koncu petja in brez
// pospeševanja med kratkimi/dolgimi vrsticami. Poudarek vrstice ostane enak.
const SMOOTH_SCROLL_TEST_TITLES = ["vojna idej"];
const SS_SMOOTH_SEC = 8;
const SS_SMOOTH_STEP = 0.1;
function fmtClock(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
const lrcOffsetsKey = (id: string) => `komadi:chords:lrcOffsets:${id}`;
// "Hitrost" predvajanja (gumb v Funkcije), za vsako skladbo; pod 0,5 je zvok YouTube preslab.
const playbackRateKey = (id: string) => `komadi:chords:rate:${id}`;
const PLAYBACK_RATES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
// "Metronom" (gumb v Funkcije): izbrani tempo za vsako skladbo; privzeto songs.bpm.
const metronomeKey = (id: string) => `komadi:chords:metronome:${id}`;
const METRO_MIN = 30;
const METRO_MAX = 240;
const METRO_STEP = 5;
// "Sam Špili": popravek velikosti besedila (množitelj), korak 5 %.
const ssScaleKey = (id: string) => `komadi:chords:ssScale:${id}`;
const SS_SCALE_STEP = 0.05;
const SS_SCALE_MIN = 0.6;
const SS_SCALE_MAX = 1.4;
const transposeKey = (id: string) => `komadi:chords:transpose:${id}`;
const workingVideoKey = (id: string) => `komadi:chords:video:${id}`;
const MIN_FONT = 10;
const MAX_FONT = 28;
const FONT_STEP = 0.5;
// Skrivanje/prikaz zgornjih vrstic ob samodejnem pomikanju: mehak ease-in-out.
const BARS_TRANSITION = "550ms cubic-bezier(0.65, 0, 0.35, 1)";

// Ozadja (BACKGROUNDS, BACKGROUND_ORDER) so v src/lib/backgrounds.ts — ista
// izbira je tudi ozadje aplikacije (⋮ → Nastavitve → Tema).
const DEFAULT_BG = 3;
// Indeks "Akordni diagram" v BACKGROUNDS.
const DEFAULT_SS_BG = 15;
// Barve besedila: "Samodejna" = barva, ki pripada ozadju (BACKGROUNDS.text);
// ostale imajo svetlo različico za temna ozadja in temno za svetla.
const TEXT_COLORS: { label: string; dark: string | null; light: string | null }[] = [
  { label: "Samodejna", dark: null, light: null },
  { label: "Kontrastna", dark: "#ffffff", light: "#000000" },
  { label: "Topla", dark: "#f1e4cf", light: "#3b2a1e" },
  { label: "Siva", dark: "#c4c4c4", light: "#4a4a4a" },
  { label: "Hladna", dark: "#d9e6f5", light: "#1e2a44" },
];
// Barve pripisov (Intro, Verse, Chorus, Solo …): "Samodejna" = rumena, oz.
// oranžna, kadar so rumeni/kremni tudi akordi.
const SECTION_COLORS: { label: string; dark: string | null; light: string | null }[] = [
  { label: "Samodejna", dark: null, light: null },
  { label: "Siva", dark: "#a3a3a3", light: "#737373" },
  { label: "Rumena", dark: "#fbbf24", light: "#b45309" },
  { label: "Oranžna", dark: "#fb923c", light: "#c2410c" },
  { label: "Rožnata", dark: "#f9a8d4", light: "#be185d" },
  { label: "Vijolična", dark: "#c4b5fd", light: "#6d28d9" },
  { label: "Modra", dark: "#7dd3fc", light: "#0369a1" },
  { label: "Turkizna", dark: "#5eead4", light: "#0f766e" },
  { label: "Zelena", dark: "#86efac", light: "#15803d" },
  { label: "Kremna", dark: "#fde68a", light: "#92400e" },
];
// Premikajoča oznaka akorda (Smart play med introm, interludijem, solom …):
// ozadje, obroba in oblika. Privzeto = kot doslej (oranžna, obroba enaka).
// Ozadje null = brez (akord ostane v svoji barvi); obroba null = kot ozadje.
const MARK_FILLS: { label: string; color: string | null }[] = [
  { label: "Oranžna", color: "#fb923c" },
  { label: "Rumena", color: "#fbbf24" },
  { label: "Rdeča", color: "#f87171" },
  { label: "Rožnata", color: "#f9a8d4" },
  { label: "Vijolična", color: "#c4b5fd" },
  { label: "Modra", color: "#38bdf8" },
  { label: "Turkizna", color: "#5eead4" },
  { label: "Zelena", color: "#4ade80" },
  { label: "Bela", color: "#f5f5f5" },
  { label: "Brez", color: null },
];
const MARK_BORDERS: { label: string; color: string | null }[] = [
  { label: "Kot ozadje", color: null },
  { label: "Oranžna", color: "#fb923c" },
  { label: "Rumena", color: "#fbbf24" },
  { label: "Rdeča", color: "#ef4444" },
  { label: "Rožnata", color: "#ec4899" },
  { label: "Vijolična", color: "#8b5cf6" },
  { label: "Modra", color: "#0ea5e9" },
  { label: "Zelena", color: "#22c55e" },
  { label: "Bela", color: "#ffffff" },
  { label: "Črna", color: "#0a0a0a" },
];
const MARK_SHAPES = [
  { label: "Oglata", radius: "0px" },
  { label: "Zaobljena", radius: "0.25rem" },
  { label: "Bolj zaobljena", radius: "0.5rem" },
  { label: "Pilula", radius: "9999px" },
];
const DEFAULT_MARK_SHAPE = 1;
// Debelina obrobe oznake (px); privzeto 2 kot doslej.
const MARK_WIDTHS = [1, 2, 3, 4];
const DEFAULT_MARK_WIDTH = 1;
// Barve akordov: svetlejša različica za temno ozadje, temnejša za svetlo.
const CHORD_COLORS = [
  { label: "Rumena", dark: "#fbbf24", light: "#b45309" },
  { label: "Oranžna", dark: "#fb923c", light: "#c2410c" },
  { label: "Rdeča", dark: "#f87171", light: "#dc2626" },
  { label: "Modra", dark: "#38bdf8", light: "#0369a1" },
  { label: "Zelena", dark: "#4ade80", light: "#15803d" },
  // Dodatne, ki se ujamejo s temnimi ozadji (rjava, modra, zelena, siva).
  { label: "Kremna", dark: "#fde68a", light: "#92400e" },
  { label: "Rožnata", dark: "#f9a8d4", light: "#be185d" },
  { label: "Vijolična", dark: "#c4b5fd", light: "#6d28d9" },
  { label: "Turkizna", dark: "#5eead4", light: "#0f766e" },
  { label: "Limeta", dark: "#bef264", light: "#4d7c0f" },
  // Za predefinirane teme (Globoka noč …).
  { label: "Ledeno modra", dark: "#7dd3fc", light: "#0369a1" },
  { label: "Smaragdna", dark: "#6ee7b7", light: "#047857" },
  { label: "Breskev", dark: "#fdba74", light: "#c2410c" },
];

// Predefinirane teme (⚙ → Tema → Predefinirane teme): en dotik nastavi ozadje,
// barvo besedila, akordov in pripisov, oznako igranega akorda, barvo črte
// trenutne vrstice in sij akordov. Barve so po imenu (label) iz seznamov zgoraj.
type ThemePreset = {
  label: string;
  bg: string;
  // Ozadje v Sam Špili, če je drugačno od navadnega pogleda (Default: Akordni diagram).
  ssBg?: string;
  // Ponastavi vidnost vzorca na privzeto (Default).
  resetPattern?: boolean;
  text: string;
  chord: string;
  section: string;
  markFill: string;
  markBorder: string;
  markShape: number;
  markWidth: number;
  line: string;
  glow: boolean;
};
const THEME_PRESETS: ThemePreset[] = [
  // Privzeti videz (kot ob prvem odprtju): navaden pogled Črna, Sam Špili Akordni diagram.
  { label: "Default", bg: "Črna", ssBg: "Akordni diagram", resetPattern: true, text: "Samodejna", chord: "Rumena", section: "Samodejna", markFill: "Oranžna", markBorder: "Kot ozadje", markShape: 1, markWidth: 1, line: "#fb923c", glow: false },
  { label: "Globoka noč", bg: "Globoka noč", text: "Hladna", chord: "Ledeno modra", section: "Vijolična", markFill: "Brez", markBorder: "Modra", markShape: 3, markWidth: 0, line: "#7dd3fc", glow: true },
  { label: "Globoka noč zelena", bg: "Globoka noč zelena", text: "Samodejna", chord: "Smaragdna", section: "Zelena", markFill: "Brez", markBorder: "Zelena", markShape: 3, markWidth: 0, line: "#6ee7b7", glow: true },
  { label: "Globoka noč vijolična", bg: "Globoka noč vijolična", text: "Samodejna", chord: "Vijolična", section: "Vijolična", markFill: "Brez", markBorder: "Vijolična", markShape: 3, markWidth: 0, line: "#c4b5fd", glow: true },
  { label: "Globoka noč oranžna", bg: "Globoka noč oranžna", text: "Topla", chord: "Breskev", section: "Oranžna", markFill: "Brez", markBorder: "Oranžna", markShape: 3, markWidth: 0, line: "#fdba74", glow: true },
  { label: "Mirno jeklo", bg: "Mirno jeklo", text: "Hladna", chord: "Turkizna", section: "Siva", markFill: "Turkizna", markBorder: "Kot ozadje", markShape: 2, markWidth: 1, line: "#5eead4", glow: false },
  { label: "Mirni dim", bg: "Mirni dim", text: "Siva", chord: "Kremna", section: "Siva", markFill: "Rumena", markBorder: "Kot ozadje", markShape: 2, markWidth: 1, line: "#fde68a", glow: false },
  { label: "Mirni gozd", bg: "Mirni gozd", text: "Samodejna", chord: "Limeta", section: "Zelena", markFill: "Zelena", markBorder: "Kot ozadje", markShape: 2, markWidth: 1, line: "#bef264", glow: false },
  { label: "Mirna globina", bg: "Mirna globina", text: "Hladna", chord: "Ledeno modra", section: "Modra", markFill: "Modra", markBorder: "Kot ozadje", markShape: 2, markWidth: 1, line: "#7dd3fc", glow: false },
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

function readOptionalNumber(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

// Zamik besedila kot "+1,25"; klik na številko jo odpre za vnos poljubne
// vrednosti v sekundah (npr. 30, -2,5) — Enter/izhod iz polja potrdi, Esc prekliče.
function OffsetValue({
  value,
  disabled,
  onSet,
  className,
}: {
  value: number;
  disabled: boolean;
  onSet: (seconds: number) => void;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = `${value > 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}`;
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.trim().replace(",", ".").replace(/\s*s$/i, ""));
    if (draft.trim() !== "" && Number.isFinite(n)) onSet(n);
    setDraft(null);
  };
  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setDraft(null);
        }}
        aria-label="Zamik besedila v sekundah"
        className={`${className} rounded border border-orange-400 bg-neutral-900 px-1 outline-none`}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setDraft(String(value).replace(".", ","))}
      title={disabled ? undefined : "Klikni in vpiši zamik v sekundah"}
      className={`${className} rounded underline decoration-dotted underline-offset-2 hover:text-white disabled:no-underline`}
    >
      {shown}
    </button>
  );
}

export default function ChordsViewer({
  song,
  onClose,
  shared,
  samSpili = false,
  autoRecord = false,
  onOpenEditor,
  inFix = false,
  nav,
}: {
  song: Song;
  onClose: () => void;
  shared?: SharedViewProp;
  // "Sam Špili": celozaslonski (ležeči) pogled, ki med Smart playem kaže samo
  // 3 vrstice — trenutno na vrhu, čez vso širino (glej overlay spodaj).
  samSpili?: boolean;
  // Odpri s takoj zagnanim snemalnikom časov ("Posnemi čase") — iz naprednega
  // urejevalnika besedila (ChordsTextEditor.tsx, način "record").
  autoRecord?: boolean;
  // Računalnik: gumb "Napredni urejevalnik" v orodni vrstici (samo za lastne
  // skladbe) — Dashboard zapre pregledovalnik, odpre ChordsTextEditor in ga
  // po zaprtju urejevalnika spet odpre.
  onOpenEditor?: () => void;
  // Skladba ima odprto prijavo (stran "Popravi skladbe") — takrat se zamik
  // besedila preverjene skladbe spet da nastavljati.
  inFix?: boolean;
  // Gumba naprej/nazaj desno od "Ali si vedel?": po vrsti po seznamu, iz
  // katerega je bila skladba odprta (Preverjeno špila / Vse skladbe).
  nav?: {
    index: number;
    count: number;
    prev: Song | null;
    next: Song | null;
    onPrev: () => void;
    onNext: () => void;
    label: string;
  };
}) {
  const follower = shared?.role === "follower" ? shared : null;
  const [followPillHidden, setFollowPillHidden] = useState(false);
  const isFollowing = !!follower;
  useEffect(() => {
    if (!isFollowing) return;
    const t = setTimeout(() => setFollowPillHidden(true), 3000);
    return () => clearTimeout(t);
  }, [isFollowing]);
  // Po skritju napisa ✕ pomeni "Ne sledi" (zapre akorde, sledenje se ustavi).
  const closeAsUnfollow = isFollowing && followPillHidden;
  // Vodjev pogled (samo sledilec): v stanju le, kar se izriše (Smart play
  // vrstica/akord, celozaslonsko, ali Sam Špili že igra); položaj gre v refe.
  const [remoteState, setRemoteState] = useState<LocalView | null>(() => {
    const e = getRemoteView();
    return e && e.songId === song.id ? e.view : null;
  });
  const remote = follower ? remoteState : null;
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
    // Preverjen predvajalnik: zaklenjen posnetek (tisti, za katerega so
    // zamrznjeni časi) je prvi; posnetek, zapomnjen na tej napravi, ne šteje.
    const locked = song.verified_player_at ? (song.synced_lines?.videoId ?? null) : null;
    return [
      ...new Set([
        locked,
        // Izbran v izbirniku posnetka (shranjen v bazi, velja na vseh napravah).
        song.preferred_video_id,
        locked ? null : remembered,
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
  const [simplify, setSimplify] = useState(() => readNumber(`${SIMPLIFY_KEY}:${song.id}`, 0) === 1);
  useEffect(() => writeNumber(`${SIMPLIFY_KEY}:${song.id}`, simplify ? 1 : 0), [simplify, song.id]);

  // "Pokaži akorde" — ena nastavitev za vse skladbe.
  const [showShapes, setShowShapes] = useState(() => readNumber(SHOW_SHAPES_KEY, 0) === 1);
  // "Nasvet" (ponavljajoča se zaporedja akordov) — razprt ali strnjen, na tej napravi.
  const [tipsOpen, setTipsOpen] = useState(() => readNumber("komadi:chords:tipsOpen", 0) === 1);
  useEffect(() => writeNumber("komadi:chords:tipsOpen", tipsOpen ? 1 : 0), [tipsOpen]);
  // Klik izven okenca "Nasvet" ga zapre.
  const tipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tipsOpen) return;
    const close = (e: PointerEvent) => {
      if (!tipsRef.current?.contains(e.target as Node)) setTipsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tipsOpen]);
  // "Ali si vedel?" (opis pesmi in zanimivosti) — razprt ali strnjen, na tej napravi.
  const [storyOpen, setStoryOpen] = useState(() => readNumber("komadi:chords:storyOpen", 0) === 1);
  // Klik na oznako dela na drsniku (Refren 2 …) skoči toliko sekund pred del
  // (⚙ → Napredne nastavitve, na napravo; privzeto 3 s).
  const [markerLead, setMarkerLead] = useState(() => readNumber("komadi:chords:markerLead", 3));
  useEffect(() => writeNumber("komadi:chords:markerLead", markerLead), [markerLead]);
  useEffect(() => writeNumber("komadi:chords:storyOpen", storyOpen ? 1 : 0), [storyOpen]);
  // Klik izven okenca "Ali si vedel?" ga zapre.
  const storyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!storyOpen) return;
    const close = (e: PointerEvent) => {
      if (!storyRef.current?.contains(e.target as Node)) setStoryOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [storyOpen]);
  // "Nasvet" → "Prikaži akorde": pod vsako vrstico nasveta prijemi njenih akordov.
  const [tipShapes, setTipShapes] = useState(() => readNumber("komadi:chords:tipShapes", 0) === 1);
  useEffect(() => writeNumber("komadi:chords:tipShapes", tipShapes ? 1 : 0), [tipShapes]);
  useEffect(() => writeNumber(SHOW_SHAPES_KEY, showShapes ? 1 : 0), [showShapes]);
  const [noCapo, setNoCapo] = useState(() => readNumber(NO_CAPO_KEY, 0) === 1);
  useEffect(() => writeNumber(NO_CAPO_KEY, noCapo ? 1 : 0), [noCapo]);
  const [shapesOpen, setShapesOpen] = useState(() => readNumber(SHAPES_OPEN_KEY, 0) === 1);
  useEffect(() => writeNumber(SHAPES_OPEN_KEY, shapesOpen ? 1 : 0), [shapesOpen]);
  // Prijemi iz opisa skladbe ("Cadd4  x 3 3 0 1 0") imajo prednost pred bazo.
  const descShapes = useMemo(() => parseDescriptionShapes(chordsText), [chordsText]);
  // Baza prijemov (naloži se ob prvi shemi ali ko je "Pokaži akorde" vklopljen).
  const [chordDb, setChordDb] = useState<Awaited<ReturnType<typeof loadChordDb>> | null>(null);
  // Ali ima pesem kak posebni akord (izračun pred songChords, ki je niže — samo za nalaganje baze).
  const hasSpecialChords = useMemo(
    () =>
      body.some((line) => {
        const names =
          line.kind === "chords" ? line.chords.map((c) => c.name)
          : line.kind === "pair" ? line.chunks.map((c) => c.chord)
          : line.kind === "text" ? line.segments.map((x) => ("chord" in x ? x.chord : null))
          : line.kind === "tab" ? (line.header ?? []).map((c) => c.name)
          : [];
        return names.some((n) => n && !isBasicChord(n));
      }),
    [body],
  );
  useEffect(() => {
    if ((!showShapes && !hasSpecialChords && !tipShapes) || chordDb) return;
    let alive = true;
    loadChordDb().then((db) => alive && setChordDb(db));
    return () => {
      alive = false;
    };
  }, [showShapes, hasSpecialChords, tipShapes, chordDb]);

  // "Tema": ozadje vsebine in barva akordov — ena nastavitev za vse skladbe.
  const [normalBgIndex, setNormalBgIndex] = useState(() => readNumber(BG_KEY, DEFAULT_BG));
  const [ssBgIndex, setSsBgIndex] = useState(() => readNumber(SS_BG_KEY, DEFAULT_SS_BG));
  useEffect(() => writeNumber(SS_BG_KEY, ssBgIndex), [ssBgIndex]);
  // V Sam Špili velja (in se nastavlja) ozadje Sam Špili, sicer navadno.
  const bgIndex = samSpili ? ssBgIndex : normalBgIndex;
  const setBgIndex = samSpili ? setSsBgIndex : setNormalBgIndex;
  const [patternOpacity, setPatternOpacity] = useState(() => readNumber(PATTERN_OPACITY_KEY, DEFAULT_PATTERN_OPACITY));
  useEffect(() => writeNumber(PATTERN_OPACITY_KEY, patternOpacity), [patternOpacity]);
  const patternColors = scaledBackgroundColors(patternOpacity);
  // Sam Špili na telefonu: vzorec malo manj viden (manjši zaslon, vzorec bolj moti besedilo).
  const ssPhonePatternColors = scaledBackgroundColors(patternOpacity * 0.75);
  const [chordColorIndex, setChordColorIndex] = useState(() => readNumber(CHORD_COLOR_KEY, 0));
  useEffect(() => writeNumber(BG_KEY, normalBgIndex), [normalBgIndex]);
  useEffect(() => writeNumber(CHORD_COLOR_KEY, chordColorIndex), [chordColorIndex]);
  const [textColorIndex, setTextColorIndex] = useState(() => readNumber(TEXT_COLOR_KEY, 0));
  useEffect(() => writeNumber(TEXT_COLOR_KEY, textColorIndex), [textColorIndex]);
  const [sectionColorIndex, setSectionColorIndex] = useState(() => readNumber(SECTION_COLOR_KEY, 0));
  useEffect(() => writeNumber(SECTION_COLOR_KEY, sectionColorIndex), [sectionColorIndex]);
  const [markFillIndex, setMarkFillIndex] = useState(() => readNumber(MARK_FILL_KEY, 0));
  const [markBorderIndex, setMarkBorderIndex] = useState(() => readNumber(MARK_BORDER_KEY, 0));
  const [markShapeIndex, setMarkShapeIndex] = useState(() => readNumber(MARK_SHAPE_KEY, DEFAULT_MARK_SHAPE));
  useEffect(() => writeNumber(MARK_FILL_KEY, markFillIndex), [markFillIndex]);
  useEffect(() => writeNumber(MARK_BORDER_KEY, markBorderIndex), [markBorderIndex]);
  useEffect(() => writeNumber(MARK_SHAPE_KEY, markShapeIndex), [markShapeIndex]);
  const [markWidthIndex, setMarkWidthIndex] = useState(() => readNumber(MARK_WIDTH_KEY, DEFAULT_MARK_WIDTH));
  useEffect(() => writeNumber(MARK_WIDTH_KEY, markWidthIndex), [markWidthIndex]);
  const [lineColor, setLineColor] = useState(() => {
    try {
      return window.localStorage.getItem(LINE_COLOR_KEY) ?? "#fb923c";
    } catch {
      return "#fb923c";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(LINE_COLOR_KEY, lineColor);
    } catch {}
  }, [lineColor]);
  const [chordGlow, setChordGlow] = useState(() => readNumber(CHORD_GLOW_KEY, 0) === 1);
  useEffect(() => writeNumber(CHORD_GLOW_KEY, chordGlow ? 1 : 0), [chordGlow]);
  const theme = BACKGROUNDS[bgIndex] ?? BACKGROUNDS[DEFAULT_BG];
  const chordColor = CHORD_COLORS[chordColorIndex] ?? CHORD_COLORS[0];
  const textColorFor = (c: (typeof TEXT_COLORS)[number]) => (theme.light ? c.light : c.dark) ?? theme.text;
  const textColor = textColorFor(TEXT_COLORS[textColorIndex] ?? TEXT_COLORS[0]);
  const autoSectionColor =
    chordColor.label === "Rumena" || chordColor.label === "Kremna"
      ? theme.light ? "#c2410c" : "#fb923c"
      : theme.light ? "#b45309" : "#fbbf24";
  const sectionColorFor = (c: (typeof SECTION_COLORS)[number]) => (theme.light ? c.light : c.dark) ?? autoSectionColor;
  const markFill = (MARK_FILLS[markFillIndex] ?? MARK_FILLS[0]).color;
  const markBorder = (MARK_BORDERS[markBorderIndex] ?? MARK_BORDERS[0]).color ?? markFill ?? "transparent";
  const markRadius = (MARK_SHAPES[markShapeIndex] ?? MARK_SHAPES[DEFAULT_MARK_SHAPE]).radius;
  const markWidth = `${MARK_WIDTHS[markWidthIndex] ?? MARK_WIDTHS[DEFAULT_MARK_WIDTH]}px`;
  const shownChordColor = theme.light ? chordColor.light : chordColor.dark;
  const themeVars = {
    // Ozadja s prelivom (Morska megla …): preliv čez osnovno barvo (brez delcev).
    backgroundImage: "gradient" in theme ? theme.gradient : undefined,
    "--cv-bg": theme.bg,
    "--cv-text": textColor,
    "--cv-title": theme.title,
    "--cv-muted": theme.muted,
    "--cv-panel": theme.panel,
    "--cv-border": theme.border,
    "--cv-chord": theme.light ? chordColor.light : chordColor.dark,
    // Imena razdelkov (Intro, Chorus …): izbrana barva pripisov; samodejno
    // rumena, če so rumeni tudi akordi, oranžna, da se ločijo od njih.
    "--cv-section": sectionColorFor(SECTION_COLORS[sectionColorIndex] ?? SECTION_COLORS[0]),
    // Premikajoča oznaka akorda; brez ozadja ostane akord v svoji barvi.
    "--cv-mark-bg": markFill ?? "transparent",
    "--cv-mark-text": markFill ? "#0a0a0a" : shownChordColor,
    "--cv-mark-border": markBorder,
    "--cv-mark-radius": markRadius,
    "--cv-mark-width": markWidth,
    // Črta ob trenutni vrstici in (po želji) mehak sij akordov (globals.css: [data-chord-name]).
    "--cv-line": lineColor,
    "--cv-chord-glow": chordGlow ? `0 0 10px color-mix(in srgb, ${shownChordColor} 55%, transparent)` : "none",
  } as CSSProperties;
  // Uporabi predefinirano temo (ozadje velja za trenutni način: navaden pogled ali Sam Špili).
  const applyPreset = (p: ThemePreset) => {
    const idx = <T extends { label: string }>(list: T[], label: string, fallback: number) => {
      const i = list.findIndex((x) => x.label === label);
      return i >= 0 ? i : fallback;
    };
    setBgIndex(idx(BACKGROUNDS, samSpili && p.ssBg ? p.ssBg : p.bg, samSpili ? DEFAULT_SS_BG : DEFAULT_BG));
    if (p.resetPattern) setPatternOpacity(DEFAULT_PATTERN_OPACITY);
    setTextColorIndex(idx(TEXT_COLORS, p.text, 0));
    setChordColorIndex(idx(CHORD_COLORS, p.chord, 0));
    setSectionColorIndex(idx(SECTION_COLORS, p.section, 0));
    setMarkFillIndex(idx(MARK_FILLS, p.markFill, 0));
    setMarkBorderIndex(idx(MARK_BORDERS, p.markBorder, 0));
    setMarkShapeIndex(p.markShape);
    setMarkWidthIndex(p.markWidth);
    setLineColor(p.line);
    setChordGlow(p.glow);
  };
  const activePreset = THEME_PRESETS.find(
    (p) =>
      BACKGROUNDS[bgIndex]?.label === (samSpili && p.ssBg ? p.ssBg : p.bg) &&
      CHORD_COLORS[chordColorIndex]?.label === p.chord &&
      MARK_FILLS[markFillIndex]?.label === p.markFill &&
      lineColor === p.line &&
      chordGlow === p.glow,
  )?.label;
  // Izbira barv (ozadje, besedilo, akordi, pripisi) — v meniju ⚙ (v "Sam Špili" pod "Tema").
  // Oba razdelka sta ob odprtju menija strnjena.
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [chordPickerOpen, setChordPickerOpen] = useState(false);
  const [textPickerOpen, setTextPickerOpen] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [markPickerOpen, setMarkPickerOpen] = useState(false);
  // Podrazdelki premikajočih oznak (vsak razpirajoč).
  const [markFillOpen, setMarkFillOpen] = useState(false);
  const [markBorderOpen, setMarkBorderOpen] = useState(false);
  const [markWidthOpen, setMarkWidthOpen] = useState(false);
  const [markShapeOpen, setMarkShapeOpen] = useState(false);
  // Krogec za izbiro barve oznake; "Brez"/"Kot ozadje" je prečrtan.
  const markSwatch = (label: string, color: string | null, selected: boolean, onPick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      title={label}
      className="flex w-11 flex-col items-center gap-1 text-[11px] leading-tight text-neutral-300"
    >
      <span
        style={{ backgroundColor: color ?? "transparent" }}
        className={`relative h-7 w-7 overflow-hidden rounded-full border border-neutral-600 ${selected ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
      >
        {!color && <span aria-hidden="true" className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 rotate-45 bg-neutral-500" />}
      </span>
      {label}
    </button>
  );
  // "Sam Špili" ⚙: razdelek "Tema" (izbirniki barv).
  const [ssSettingsThemeOpen, setSsSettingsThemeOpen] = useState(false);
  const pickerHeader = (label: string, open: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      className={`flex w-full items-center justify-between text-left text-[13px] font-medium text-neutral-400 hover:text-neutral-200 ${open ? "mb-1.5" : ""}`}
    >
      {label}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3.5 w-3.5 text-amber-400 transition ${open ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
  const themePickers = (
    <>
      <div>
        {pickerHeader("Predefinirane teme", presetsOpen, () => setPresetsOpen((v) => !v))}
        {presetsOpen && (
          <div className="grid grid-cols-3 gap-2">
            {THEME_PRESETS.map((p) => {
              const b = BACKGROUNDS.find((x) => x.label === (samSpili && p.ssBg ? p.ssBg : p.bg)) ?? BACKGROUNDS[DEFAULT_BG];
              const c = CHORD_COLORS.find((x) => x.label === p.chord) ?? CHORD_COLORS[0];
              const on = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={on}
                  title={p.label}
                  className="flex min-w-0 flex-col items-center gap-1 text-[10px] leading-tight text-neutral-300"
                >
                  <span
                    style={{ backgroundColor: b.bg, backgroundImage: "gradient" in b ? b.gradient : undefined, borderColor: on ? p.line : undefined }}
                    className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border font-mono text-[13px] font-bold ${on ? "border-2" : "border-neutral-600"}`}
                  >
                    <span style={{ color: c.dark, textShadow: p.glow ? `0 0 8px ${c.dark}` : undefined }}>Am</span>
                    <span aria-hidden="true" className="h-3 w-0.5 rounded-full" style={{ backgroundColor: p.line }} />
                  </span>
                  <span className="w-full truncate text-center">{p.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        {pickerHeader("Barva ozadja", bgPickerOpen, () => setBgPickerOpen((v) => !v))}
        {bgPickerOpen && (
        <div className="grid grid-cols-5 justify-items-center gap-y-2">
          {BACKGROUND_ORDER.map((i) => {
            const b = BACKGROUNDS[i];
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => setBgIndex(i)}
                aria-pressed={bgIndex === i}
                title={b.label}
                className="flex w-11 flex-col items-center gap-1 text-[11px] leading-tight text-neutral-300"
              >
                <span
                  style={{ backgroundColor: b.bg }}
                  className={`h-7 w-7 overflow-hidden rounded-full border border-neutral-600 ${bgIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
                >
                  {b.pattern && (
                    <PatternSvg id={b.pattern} colors={{ line: "rgba(255,255,255,0.45)", accent: "rgba(52,211,153,0.9)" }} className="h-full w-full" />
                  )}
                </span>
                {b.label}
              </button>
            );
          })}
        </div>
        )}
        {bgPickerOpen && (
          // Vidnost vzorca (samo ozadja z vzorcem): 0 … 600 %, privzeto 350 %.
          <div className="mt-3">
            <label htmlFor="cv-pattern-opacity" className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
              <span>Vidnost vzorca</span>
              <span className="tabular-nums text-neutral-200">{Math.round(patternOpacity * 100)} %</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cv-pattern-opacity"
                type="range"
                min={0}
                max={PATTERN_OPACITY_MAX}
                step={0.05}
                value={patternOpacity}
                disabled={!theme.pattern}
                onChange={(e) => setPatternOpacity(Number(e.target.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-orange-400 disabled:cursor-default disabled:opacity-40"
              />
              {patternOpacity !== DEFAULT_PATTERN_OPACITY && (
                <button
                  type="button"
                  onClick={() => setPatternOpacity(DEFAULT_PATTERN_OPACITY)}
                  className="shrink-0 rounded-full border border-neutral-600 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-orange-400 hover:text-orange-300"
                >
                  Privzeto
                </button>
              )}
            </div>
            {!theme.pattern && <p className="mt-1 text-[10px] text-neutral-500">Izberi ozadje z vzorcem (Plastnice, Vrat kitare, Zvočnik, Akordni diagram).</p>}
          </div>
        )}
      </div>
      <div>
        {pickerHeader("Barva besedila", textPickerOpen, () => setTextPickerOpen((v) => !v))}
        {textPickerOpen && (
        <div className="grid grid-cols-5 justify-items-center gap-y-2">
          {TEXT_COLORS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setTextColorIndex(i)}
              aria-pressed={textColorIndex === i}
              title={c.label}
              className="flex w-11 flex-col items-center gap-1 text-[11px] leading-tight text-neutral-300"
            >
              {/* Predogled: "Aa" v tej barvi na trenutnem ozadju. */}
              <span
                style={{ backgroundColor: theme.bg, color: textColorFor(c) }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border border-neutral-600 text-[11px] font-semibold ${textColorIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
              >
                Aa
              </span>
              {c.label}
            </button>
          ))}
        </div>
        )}
      </div>
      <div>
        {pickerHeader("Barva akordov", chordPickerOpen, () => setChordPickerOpen((v) => !v))}
        {chordPickerOpen && (
        <div className="grid grid-cols-5 justify-items-center gap-y-2">
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
        )}
      </div>
      <div>
        {pickerHeader("Premikajoče oznake", markPickerOpen, () => setMarkPickerOpen((v) => !v))}
        {markPickerOpen && (
          // Črta levo: vse spodaj sodi v "Premikajoče oznake".
          <div className="ml-1 space-y-2.5 border-l border-orange-400/40 pl-3">
            {/* Predogled oznake na trenutnem ozadju. */}
            <div style={{ backgroundColor: theme.bg }} className="flex justify-center gap-4 rounded-lg border border-neutral-700 py-2 font-mono text-sm font-bold">
              <span style={{ color: shownChordColor }}>G</span>
              <span
                style={{
                  backgroundColor: markFill ?? "transparent",
                  color: markFill ? "#0a0a0a" : shownChordColor,
                  boxShadow: `0 0 0 ${markWidth} ${markBorder}`,
                  borderRadius: markRadius,
                  padding: "0 0.2em",
                  margin: "0 -0.2em",
                }}
              >
                Am
              </span>
              <span style={{ color: shownChordColor }}>F</span>
            </div>
            <div className="space-y-2.5">
            <div>
              {pickerHeader("Barva ozadja", markFillOpen, () => setMarkFillOpen((v) => !v))}
              {markFillOpen && (
              <div className="grid grid-cols-5 justify-items-center gap-y-2">
                {MARK_FILLS.map((c, i) => markSwatch(c.label, c.color, markFillIndex === i, () => setMarkFillIndex(i)))}
              </div>
              )}
            </div>
            <div>
              {pickerHeader("Barva obrobe", markBorderOpen, () => setMarkBorderOpen((v) => !v))}
              {markBorderOpen && (
              <div className="grid grid-cols-5 justify-items-center gap-y-2">
                {MARK_BORDERS.map((c, i) => markSwatch(c.label, c.color, markBorderIndex === i, () => setMarkBorderIndex(i)))}
              </div>
              )}
            </div>
            <div>
              {pickerHeader("Debelina obrobe", markWidthOpen, () => setMarkWidthOpen((v) => !v))}
              {markWidthOpen && (
              <div className="grid grid-cols-4 justify-items-center gap-y-2">
                {MARK_WIDTHS.map((w, i) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setMarkWidthIndex(i)}
                    aria-pressed={markWidthIndex === i}
                    title={`${w} px`}
                    className="flex w-14 flex-col items-center gap-1 text-center text-[11px] leading-tight text-neutral-300"
                  >
                    <span
                      style={{ borderWidth: w }}
                      className={`h-6 w-10 rounded border-orange-400 ${markWidthIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
                    />
                    {w} px
                  </button>
                ))}
              </div>
              )}
            </div>
            <div>
              {pickerHeader("Oblika", markShapeOpen, () => setMarkShapeOpen((v) => !v))}
              {markShapeOpen && (
              <div className="grid grid-cols-4 justify-items-center gap-y-2">
                {MARK_SHAPES.map((sh, i) => (
                  <button
                    key={sh.label}
                    type="button"
                    onClick={() => setMarkShapeIndex(i)}
                    aria-pressed={markShapeIndex === i}
                    title={sh.label}
                    className="flex w-14 flex-col items-center gap-1 text-center text-[11px] leading-tight text-neutral-300"
                  >
                    <span
                      style={{ borderRadius: sh.radius }}
                      className={`h-6 w-10 border-2 border-orange-400 bg-orange-400/30 ${markShapeIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
                    />
                    {sh.label}
                  </button>
                ))}
              </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
      <div>
        {pickerHeader("Barva pripisov", sectionPickerOpen, () => setSectionPickerOpen((v) => !v))}
        {sectionPickerOpen && (
        <div className="grid grid-cols-5 justify-items-center gap-y-2">
          {SECTION_COLORS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setSectionColorIndex(i)}
              aria-pressed={sectionColorIndex === i}
              title={c.label}
              className="flex w-11 flex-col items-center gap-1 text-[11px] leading-tight text-neutral-300"
            >
              {/* Predogled: pripis v tej barvi na trenutnem ozadju. */}
              <span
                style={{ backgroundColor: theme.bg, color: sectionColorFor(c) }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border border-neutral-600 font-sans text-[9px] font-semibold ${sectionColorIndex === i ? "ring-2 ring-orange-400 ring-offset-2 ring-offset-neutral-900" : ""}`}
              >
                Intro
              </span>
              {c.label}
            </button>
          ))}
        </div>
        )}
      </div>
    </>
  );
  // "Sam Špili": stranska vrstica z gumbi (skrita desno, odpre jo gumb Meni).
  const [ssSidebarOpen, setSsSidebarOpen] = useState(false);
  // "Sam Špili": ročni popravek velikosti besedila (gumba − / + spodaj desno) —
  // množitelj na samodejno velikost, za vsako skladbo posebej na tej napravi.
  const [ssScale, setSsScale] = useState(() => {
    try {
      const n = Number(window.localStorage.getItem(ssScaleKey(song.id)));
      return n >= SS_SCALE_MIN && n <= SS_SCALE_MAX ? n : 1;
    } catch {
      return 1;
    }
  });
  const setSsScaleTo = (value: number) => {
    const next = Math.min(SS_SCALE_MAX, Math.max(SS_SCALE_MIN, Math.round(value * 100) / 100));
    setSsScale(next);
    try {
      window.localStorage.setItem(ssScaleKey(song.id), String(next));
    } catch {}
  };
  const changeSsScale = (delta: number) => setSsScaleTo(ssScale + delta);
  // Pinch z dvema prstoma (zanka pomikanja) bere in nastavlja velikost prek refov.
  const ssScaleRef = useRef(ssScale);
  const setSsScaleToRef = useRef(setSsScaleTo);
  useEffect(() => {
    ssScaleRef.current = ssScale;
    setSsScaleToRef.current = setSsScaleTo;
  });

  // Izbirnik teme: fixed pod gumbom (vrstica z gumbi ima overflow-hidden).
  // V "Sam Špili" (ssSettingsRef) se odpre levo od gumba in navzgor od njegovega dna.
  const [themeMenuPos, setThemeMenuPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight?: number } | null>(null);
  // Razdelek "Napredne nastavitve" na dnu menija ⚙ (razprt/strnjen).
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Podrazdelek "Pametni predvajalnik" v naprednih nastavitvah (razprt/strnjen).
  const [smartInfoOpen, setSmartInfoOpen] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const ssSettingsRef = useRef<HTMLButtonElement>(null);
  // Začetni zaslon Sam Špili: gumb Meni odpre isti meni ⚙ (stranske vrstice tam ni).
  const ssStartMenuRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const closeThemeMenu = () => setThemeMenuPos(null);
  const toggleThemeMenu = () => {
    if (themeMenuPos) return closeThemeMenu();
    const r = themeButtonRef.current?.getBoundingClientRect();
    if (!r) return;
    setThemeMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
  };
  // Ob zaprtju stranske vrstice se zapre tudi njen meni ⚙.
  const toggleSsSidebar = () => {
    if (ssSidebarOpen) closeThemeMenu();
    setSsSidebarOpen((o) => !o);
  };
  const toggleSsSettings = () => {
    if (themeMenuPos) return closeThemeMenu();
    const r = ssSettingsRef.current?.getBoundingClientRect();
    if (!r) return;
    setThemeMenuPos({ bottom: window.innerHeight - r.bottom, left: Math.max(8, r.left - 12 - 288), maxHeight: r.bottom - 8 });
  };
  const toggleSsStartMenu = () => {
    if (themeMenuPos) return closeThemeMenu();
    const r = ssStartMenuRef.current?.getBoundingClientRect();
    if (!r) return;
    setThemeMenuPos({ top: r.top, left: Math.max(8, r.left - 12 - 288), maxHeight: window.innerHeight - r.top - 8 });
  };
  useBackableOpen(themeMenuPos !== null, closeThemeMenu);
  useEffect(() => {
    if (!themeMenuPos) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (themeMenuRef.current?.contains(t) || themeButtonRef.current?.contains(t) || ssSettingsRef.current?.contains(t) || ssStartMenuRef.current?.contains(t)) return;
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
  const cancelEdit = () => {
    if (draft !== null && draft !== toEditableText(chordsText) && !window.confirm("Zavržem spremembe?")) return;
    setDraft(null);
  };
  // Zadnje stanje shranjenih časov za saveEdit (branje prek ref-a).
  const syncStateRef = useRef<Pick<Song, "synced_lines" | "synced_chords" | "verified_player_at">>({});
  const saveEdit = async () => {
    if (draft === null) return;
    if (draft === toEditableText(chordsText)) return setDraft(null);
    const next = applyEditedText(chordsText, draft);
    // Shranjeni časi dobijo nove številke vrstic; če katere vrstice ni več,
    // se oznaka "Predvajalnik preverjen" umakne.
    const rebase = rebaseSyncOnEdit(syncStateRef.current, next);
    setSaving(true);
    setEditError(null);
    const { error } = await supabase.from("songs").update({ chords_text: next, ...rebase }).eq("id", song.id);
    setSaving(false);
    if (error) return setEditError(`Shranjevanje ni uspelo: ${error.message}`);
    if (rebase.synced_lines) setSyncedLines(rebase.synced_lines);
    if (rebase.synced_chords) setSyncedChords(rebase.synced_chords);
    if ("verified_player_at" in rebase) setVerifiedPlayerAt(null);
    setChordsText(next);
    setDraft(null);
  };
  useBackableOpen(editing, cancelEdit);

  // Gumb celozaslonsko: skrije obe zgornji vrstici (kot med samodejnim
  // pomikanjem) in, kjer gre (Fullscreen API — ne npr. v iPhone Safariju),
  // še vrstico brskalnika/sistema. Izhod: gumb v kotu ali Nazaj.
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
    if (canBrowserFullscreen()) document.documentElement.requestFullscreen().catch(() => {});
  };
  const exitFullscreen = () => {
    setIsFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  useBackableOpen(isFullscreen, exitFullscreen);

  // "Zasukaj zaslon" (telefon): pregledovalnik v ležečem načinu, tudi ko je telefon
  // pokončen. Najprej prava zaklenitev usmeritve (Android: v nameščeni aplikaciji
  // takoj, v brskalniku po celozaslonskem načinu, ki ga zahteva); kjer je ni
  // (iPhone), koren pregledovalnika zasučemo s CSS za 90°. Ponoven dotik, Android
  // Nazaj ali izhod iz celozaslonskega načina vrne pokončno.
  const [rotateOn, setRotateOn] = useState(false);
  const [rotateLocked, setRotateLocked] = useState(false);
  const [portrait, setPortrait] = useState(() => typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches);
  // Sam Špili (telefon): gumb pod Meni zasuka zaslon v pokončni ali nazaj v ležeči
  // način — zaklenitev usmeritve, ki jo brskalnik dovoli le v celozaslonskem načinu
  // (requestFullscreen mora biti v istem dotiku); kjer zaklepanja ni (iPhone), ne naredi nič.
  const ssToggleOrientation = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    const lock = () => o?.lock?.(portrait ? "landscape" : "portrait").catch(() => {});
    if (canBrowserFullscreen() && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(lock, () => {});
    } else {
      lock();
    }
  };
  const rotateFsRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const lockLandscape = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    return o?.lock ? o.lock("landscape").then(() => true, () => false) : Promise.resolve(false);
  };
  const exitRotate = () => {
    setRotateOn(false);
    setRotateLocked(false);
    try {
      screen.orientation?.unlock?.();
    } catch {}
    if (rotateFsRef.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    rotateFsRef.current = false;
  };
  const enterRotate = () => {
    closeThemeMenu();
    setRotateOn(true);
    // requestFullscreen mora biti v istem dotiku (porabi dovoljenje klika).
    if (canBrowserFullscreen() && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          rotateFsRef.current = true;
          return lockLandscape();
        })
        .then((ok) => setRotateLocked(ok), () => setRotateLocked(false));
    } else {
      lockLandscape().then(setRotateLocked);
    }
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && rotateFsRef.current) {
        rotateFsRef.current = false;
        setRotateOn(false);
        setRotateLocked(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      try {
        screen.orientation?.unlock?.();
      } catch {}
    };
  }, []);
  useBackableOpen(rotateOn, exitRotate);
  // Ležeči način na telefonu (zasukano z gumbom ali telefon obrnjen): nad
  // autoscrollom gumba + / − za pisavo. Pinch z dvema prstoma jo spreminja na
  // vsaki napravi na dotik, pokončno in ležeče.
  const [coarse, setCoarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const landscapeMode = rotateOn || (!portrait && coarse);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !(coarse || rotateOn)) return;
    let startDist = 0;
    let startFont = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDist = dist(e.touches);
      startFont = fontSizeRef.current;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const next = Math.round(((startFont * dist(e.touches)) / startDist) / FONT_STEP) * FONT_STEP;
      setFontSize(Math.max(MIN_FONT, Math.min(MAX_FONT, next)));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    // Brskalnikov pinch-zoom tu izklopljen, da pinch spreminja samo pisavo.
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = "pan-x pan-y";
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.style.touchAction = prevTouchAction;
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [coarse, rotateOn]);
  const fontButtons = landscapeMode ? (
    <div className="flex flex-col items-center gap-0.5 rounded-full border-2 border-amber-400 bg-neutral-900/90 px-1 py-1 text-neutral-200 shadow-lg">
      <button
        type="button"
        onClick={() => setFontSize((f) => Math.min(MAX_FONT, f + FONT_STEP))}
        disabled={fontSize >= MAX_FONT}
        aria-label="Večja pisava"
        title="Večja pisava"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 active:scale-95"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setFontSize((f) => Math.max(MIN_FONT, f - FONT_STEP))}
        disabled={fontSize <= MIN_FONT}
        aria-label="Manjša pisava"
        title="Manjša pisava"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 active:scale-95"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  ) : null;
  // CSS zasuk samo, ko prave zaklenitve ni in je telefon še pokončen.
  const cssRotate = rotateOn && !rotateLocked && portrait;
  const rootStyle: CSSProperties = cssRotate
    ? {
        ...themeVars,
        inset: "auto",
        top: 0,
        left: "100vw",
        width: "100dvh",
        height: "100vw",
        transform: "rotate(90deg)",
        transformOrigin: "top left",
      }
    : themeVars;
  // Zgornji vrstici skrite: med samodejnim pomikanjem (samo telefon) ali v
  // celozaslonskem načinu. Na računalniku sta sicer vedno vidni (tudi ob drsenju).
  const desktopBars = useIsDesktop();
  const barsHidden = (fullscreen && !desktopBars) || isFullscreen || !!remote?.fullscreen;

  // Drsenje: zgornji vrstici sta lepljivi (sticky) prvi del pomičnega besedila.
  // Navzdol ju besedilo naravno odrine gor (kot filtri v aplikaciji Kam — brez
  // JS, zato gladko). Navzgor se pokažeta od zgoraj: "revealed" (0 … višina)
  // pove, koliko sta prikazani čez naravni položaj; lepljivi top = revealed − višina.
  // Samo uporabnikovo drsenje (zadnjih 800 ms dotik/kolesce) spreminja revealed,
  // samodejno (Smart play, autoscroll) ne. Spust na pol poti se dokonča.
  const barsOuterRef = useRef<HTMLDivElement>(null);
  const barsItemRef = useRef<HTMLDivElement>(null);
  const barsRevealRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    const item = barsItemRef.current;
    const outer = barsOuterRef.current;
    if (!el || !item || !outer) return;
    const setReveal = (r: number, animate: boolean) => {
      const h = item.offsetHeight;
      const v = Math.max(0, Math.min(h, r));
      barsRevealRef.current = v;
      outer.style.transition = `grid-template-rows ${BARS_TRANSITION}${animate ? ", top 200ms ease-out" : ""}`;
      outer.style.top = `${v - h}px`;
    };
    if (barsHidden || editing || desktopBars) {
      setReveal(0, false);
      outer.style.top = "0px";
      return;
    }
    setReveal(barsRevealRef.current, false);
    // višina se spremeni (prelom orodne vrstice, vrtenje telefona)
    const ro = new ResizeObserver(() => setReveal(barsRevealRef.current, false));
    ro.observe(item);
    let last = el.scrollTop;
    let lastUser = 0;
    let snapTimer = 0;
    const markUser = () => {
      lastUser = performance.now();
    };
    const onScroll = () => {
      const top = el.scrollTop;
      const d = top - last;
      last = top;
      if (top <= 0) {
        if (barsRevealRef.current > 0) setReveal(0, false);
        return;
      }
      if (performance.now() - lastUser > 800) return;
      setReveal(barsRevealRef.current - d, false);
      window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        const h = item.offsetHeight;
        const r = barsRevealRef.current;
        // Blizu vrha (vrstici še v naravnem položaju) ni kaj dokončati.
        if (r > 0 && r < h && el.scrollTop > h) setReveal(r > h / 2 ? h : 0, true);
      }, 180);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", markUser, { passive: true });
    el.addEventListener("touchmove", markUser, { passive: true });
    el.addEventListener("touchend", markUser, { passive: true });
    el.addEventListener("wheel", markUser, { passive: true });
    return () => {
      window.clearTimeout(snapTimer);
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", markUser);
      el.removeEventListener("touchmove", markUser);
      el.removeEventListener("touchend", markUser);
      el.removeEventListener("wheel", markUser);
    };
  }, [barsHidden, editing, desktopBars]);

  // Računalnik: povečava orodne vrstice, da je vsebina v eni vrsti do desnega
  // roba (laptop 1280 px in večji zasloni; največ 135 %). Izmeri se pri 100 % brez
  // prelamljanja ob vsakem izrisu (gumbi se pojavijo/izginejo) in ob spremembi velikosti.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarScale, setToolbarScaleState] = useState<number | null>(() => readOptionalNumber(TOOLBAR_SCALE_KEY));
  const setToolbarScale = (v: number | null) => {
    setToolbarScaleState(v);
    try {
      if (v === null) window.localStorage.removeItem(TOOLBAR_SCALE_KEY);
      else window.localStorage.setItem(TOOLBAR_SCALE_KEY, String(v));
    } catch {}
  };
  // Zložena orodna vrstica (puščica pri ⚙); predvajalnik ostane. Na napravo.
  const [toolbarCollapsed, setToolbarCollapsedState] = useState(() => readOptionalNumber(TOOLBAR_COLLAPSED_KEY) === 1);
  const setToolbarCollapsed = (v: boolean) => {
    setToolbarCollapsedState(v);
    writeNumber(TOOLBAR_COLLAPSED_KEY, v ? 1 : 0);
  };
  // Prvi klik iz "samodejno" začne pri trenutni (izračunani) velikosti.
  const stepToolbarScale = (d: number) => {
    const from = toolbarScale ?? (Number(toolbarRef.current?.style.zoom) || 1);
    const next = Math.round((from + d * TOOLBAR_SCALE_STEP) * 20) / 20;
    setToolbarScale(Math.max(TOOLBAR_SCALE_MIN, Math.min(TOOLBAR_SCALE_MAX, next)));
  };
  const fitToolbar = useCallback(() => {
    const el = toolbarRef.current;
    if (!el) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      el.style.zoom = "";
      return;
    }
    // Ročna velikost (⚙ → Napredne nastavitve) ali ob odprtem Impro največja samodejna;
    // gumbi se po potrebi prelomijo v drugo vrsto.
    if (el.dataset.scale) {
      el.style.zoom = el.dataset.scale;
      return;
    }
    if (el.dataset.impro !== undefined) {
      el.style.zoom = "1.35";
      return;
    }
    el.style.zoom = "1";
    const have = el.getBoundingClientRect().width;
    el.style.flexWrap = "nowrap";
    el.style.width = "max-content";
    const need = el.getBoundingClientRect().width;
    el.style.width = "";
    el.style.flexWrap = "";
    el.style.zoom = String(Math.max(0.8, Math.min(1.35, (have / Math.max(1, need)) * 0.995)));
  }, []);
  useLayoutEffect(() => {
    fitToolbar();
  });
  useEffect(() => {
    window.addEventListener("resize", fitToolbar);
    return () => window.removeEventListener("resize", fitToolbar);
  }, [fitToolbar]);
  const shift = (d: number) => setSemitones((s) => wrap(s + d));
  // Premik akordov = transpozicija + (No capo) capo skladbe.
  const capoShift = noCapo && capo ? capo : 0;
  const chordShift = wrap(semitones + capoShift);
  const display = (name: string) => {
    const t = transposeChord(name, chordShift);
    return simplify ? simplifyChord(t) : t;
  };

  // "Pokaži akorde": vsi akordi v pesmi (kot so prikazani), po vrsti prve pojavitve.
  const songChords = (() => {
    const names = new Set<string>();
    const add = (name: string | null) => {
      if (name) names.add(simplify ? simplifyChord(transposeChord(name, chordShift)) : transposeChord(name, chordShift));
    };
    for (const line of body) {
      if (line.kind === "chords") line.chords.forEach((c) => add(c.name));
      else if (line.kind === "pair") line.chunks.forEach((c) => add(c.chord));
      else if (line.kind === "text") line.segments.forEach((s) => "chord" in s && add(s.chord));
      else if (line.kind === "tab") line.header?.forEach((c) => add(c.name));
    }
    return [...names];
  })();
  // Posebni akordi (vse razen navadnih durovih/molovih trozvokov — A, Am, Cm,
  // Bbm, F# … tudi kot barre): /bas, add, sus, 7, maj7, 6, dim … Prikazani so
  // vedno na vrhu; "Pokaži akorde" prikaže vse.
  const specialChords = songChords.filter((n) => !isBasicChord(n));
  // "Impro": vsi prikazani akordi po vrsti (s ponovitvami) za zaznavo tonalitete.
  const [improOpen, setImproOpen] = useState(false);
  // "Kviz": ugibanje akordov po delih — nadomesti besedilo (da se odgovorov ne vidi), predvajalnik ostane.
  const [quizOpen, setQuizOpen] = useState(false);
  useBackableOpen(quizOpen, () => setQuizOpen(false));
  // "Hitrost": počasnejše predvajanje posnetka za vadbo (Smart play in oznake
  // sledijo, ker gredo po času videa); zapomnjeno za vsako skladbo na napravi.
  const [playbackRate, setPlaybackRateState] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(playbackRateKey(song.id)));
      return PLAYBACK_RATES.includes(v) ? v : 1;
    } catch {
      return 1;
    }
  });
  const setPlaybackRate = (rate: number) => {
    setPlaybackRateState(rate);
    try {
      if (rate === 1) window.localStorage.removeItem(playbackRateKey(song.id));
      else window.localStorage.setItem(playbackRateKey(song.id), String(rate));
    } catch {}
  };
  // "Metronom": privzeto tempo skladbe (songs.bpm, sicer 100), − / + po 5 BPM;
  // izbrani tempo zapomnjen za vsako skladbo na napravi.
  const songBpm = song.bpm ? Math.round(song.bpm) : null;
  const [metroBpm, setMetroBpmState] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(metronomeKey(song.id)));
      if (v >= METRO_MIN && v <= METRO_MAX) return v;
    } catch {}
    return songBpm ?? 100;
  });
  const setMetroBpm = (bpm: number) => {
    const v = Math.max(METRO_MIN, Math.min(METRO_MAX, Math.round(bpm)));
    setMetroBpmState(v);
    try {
      if (v === (songBpm ?? 100)) window.localStorage.removeItem(metronomeKey(song.id));
      else window.localStorage.setItem(metronomeKey(song.id), String(v));
    } catch {}
  };
  const [metroOn, setMetroOn] = useState(false);
  const metronome = useMetronome(metroBpm, metroOn);
  const metroButtonRef = useRef<HTMLButtonElement>(null);
  const [metroMenuPos, setMetroMenuPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!metroMenuPos) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("[data-metro-menu]") || metroButtonRef.current?.contains(t)) return;
      setMetroMenuPos(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [metroMenuPos]);
  const toggleMetroMenu = () => {
    const r = metroButtonRef.current?.getBoundingClientRect();
    if (metroMenuPos || !r) return setMetroMenuPos(null);
    setMetroMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 216)) });
  };
  const rateButtonRef = useRef<HTMLButtonElement>(null);
  const [rateMenuPos, setRateMenuPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!rateMenuPos) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("[data-rate-menu]") || rateButtonRef.current?.contains(t)) return;
      setRateMenuPos(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [rateMenuPos]);
  const toggleRateMenu = () => {
    const r = rateButtonRef.current?.getBoundingClientRect();
    if (rateMenuPos || !r) return setRateMenuPos(null);
    setRateMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 140)) });
  };
  const improChords = (() => {
    const out: string[] = [];
    const add = (name: string | null) => {
      if (name) out.push(simplify ? simplifyChord(transposeChord(name, chordShift)) : transposeChord(name, chordShift));
    };
    for (const line of body) {
      if (line.kind === "chords") line.chords.forEach((c) => add(c.name));
      else if (line.kind === "pair") line.chunks.forEach((c) => add(c.chord));
      else if (line.kind === "text") line.segments.forEach((s) => "chord" in s && add(s.chord));
      else if (line.kind === "tab") line.header?.forEach((c) => add(c.name));
    }
    return out;
  })();
  const shapeChords = showShapes ? songChords : specialChords;

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
  // Ročno posneti ali zamrznjeni časi (songs.synced_lines) imajo prednost pred LRCLIB.
  const [syncedLines, setSyncedLines] = useState<SyncedLines | null>(song.synced_lines ?? null);
  // Ročno preverjeno (0035): predvajalnik usklajen (oznaki se nastavljata na strani Pregled in odobritev).
  const [verifiedPlayerAt, setVerifiedPlayerAt] = useState(song.verified_player_at ?? null);
  // Posnetek, ki trenutno igra (onPlaying) — zamik velja zanj.
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  // Preverjen predvajalnik velja samo za posnetek, na katerem je bil potrjen.
  const lockedVideo = verifiedPlayerAt ? (syncedLines?.videoId ?? null) : null;
  const wrongVideo = !!lockedVideo && !!playingVideo && playingVideo !== lockedVideo;
  // Shranjeni časi so vezani na številko vrstice: če se je premaknila (urejeno
  // besedilo, drugačno razčlenjevanje), jih ključ vrstice (key) prestavi.
  const syncedRemap = useMemo(
    () => (syncedLines?.points.length ? remapLines(syncedLines.points, body) : null),
    [syncedLines, body],
  );
  const sync = useMemo(() => {
    if (wrongVideo) return null;
    if (syncedRemap?.ok) {
      const points = manualSyncPoints(syncedRemap.points);
      return { points, matched: points.length, total: points.length, manual: true };
    }
    if (!lrc) return null;
    const aligned = alignLyrics(lrc.lines, body);
    const points = INSTRUMENTAL_TEST_TITLES.includes(song.title.trim().toLowerCase())
      ? [...aligned.points, ...instrumentalPoints(aligned.points, lrc.lines, body)].sort((a, b) => a.time - b.time)
      : aligned.points;
    return { points, matched: aligned.matched, total: lrc.lines.filter((l) => l.text).length, manual: false };
  }, [wrongVideo, syncedRemap, lrc, body, song.title]);
  // Ročno posneti časi posameznih akordov (songs.synced_chords) — dodatna
  // plast: ob času se obarva prav ta akord (intro, solo …).
  // Razdeljeno na instrumentalne dele (Intro, Instrumental 1 …), vsak s svojim zamikom.
  const [syncedChords, setSyncedChords] = useState<SyncedChords | null>(song.synced_chords?.sections ? song.synced_chords : null);
  // Deli z vrsticami, prestavljenimi po ključu (kot pri synced_lines).
  const chordSections = useMemo(
    () => (syncedChords?.sections ?? []).map((s) => ({ ...s, points: remapLines(s.points, body).points })),
    [syncedChords, body],
  );
  // Telefon (zaslon < 1024 px): deli z akordi uporabljajo svoj zamik (offsetPhone).
  const [isPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  // "Zamik akordov": deli samo z akordi v zapetih vrsticah (podčrtani) se
  // premaknejo za synced_chords.sungOffset; intro/solo (vrstice brez besedila) ne.
  const sungOffset = syncedChords?.sungOffset ?? 0;
  const [sungChordsOn, setSungChordsOn] = useState(() => readNumber(SUNG_CHORDS_KEY, 1) === 1);
  useEffect(() => writeNumber(SUNG_CHORDS_KEY, sungChordsOn ? 1 : 0), [sungChordsOn]);
  const chordPoints = useMemo(() => {
    const lyricLine = (i: number) => {
      const l = body[i];
      return l?.kind === "pair" || (l?.kind === "text" && l.segments.some((s) => "text" in s && s.text.trim() !== ""));
    };
    const isSung = (s: (typeof chordSections)[number]) => s.points.length > 0 && s.points.every((p) => lyricLine(p.line));
    const shifted = chordSections
      .filter((s) => sungChordsOn || !syncedChords?.sungUnderline || !isSung(s))
      .map((s) =>
        sungOffset && isSung(s)
          ? { ...s, offset: s.offset + sungOffset, offsetPhone: s.offsetPhone != null ? s.offsetPhone + sungOffset : undefined }
          : s,
      );
    return flattenChordSections(shifted, isPhone);
  }, [chordSections, isPhone, sungOffset, body, sungChordsOn, syncedChords?.sungUnderline]);
  useEffect(() => {
    syncStateRef.current = { synced_lines: syncedLines, synced_chords: syncedChords, verified_player_at: verifiedPlayerAt };
  });
  const [activeChord, setActiveChord] = useState<{ line: number; chord: number } | null>(null);
  // Akordi, natapkani ob istem trenutku kot activeChord (obarvani hkrati), ključi "vrstica:akord".
  const [activeChordsAlso, setActiveChordsAlso] = useState<string>("");
  // Na voljo, če je besedilo s časi ali posneti akordi; sledi pa samo po
  // gumbu "Smart play" (navadni ▶ samo predvaja, kot prej).
  // Časi akordov veljajo samo za posnetek, na katerem so bili posneti: na
  // drugem (npr. daljši uvod) bi bile oznake zamaknjene, zato se ne kažejo.
  const chordsWrongVideo = !!syncedChords?.videoId && !!playingVideo && playingVideo !== syncedChords.videoId;
  const liveChordPoints = chordsWrongVideo ? [] : chordPoints;
  const smartAvailable = (!!sync && sync.points.length > 0) || liveChordPoints.length > 0;
  const [smartOn, setSmartOn] = useState(false);
  const smartActive = smartAvailable && smartOn;
  const [lrcOffsets, setLrcOffsets] = useState<Record<string, number>>(() => {
    let local: Record<string, number> = {};
    try {
      local = JSON.parse(window.localStorage.getItem(lrcOffsetsKey(song.id)) ?? "{}");
    } catch {}
    return { ...local, ...(song.lrc_offsets ?? {}) };
  });
  // Računalnik: gumbi za zamik v vrstici se razprejo šele ob kliku na "Zamik".
  const [offsetOpen, setOffsetOpen] = useState(false);
  // Gumb "Ton": strnjen (ikona + napis + zamik), klik odpre − / vrednost / +.
  const [toneOpen, setToneOpen] = useState(false);
  // Posnetek, za katerega velja zamik: tisti, ki igra, pred prvim predvajanjem
  // pa prvi kandidat (zaigra ob ▶) — tako se zamik da vpisati že vnaprej.
  const offsetVideo = playingVideo ?? videoIds[0] ?? null;
  const lrcOffset = offsetVideo ? (lrcOffsets[offsetVideo] ?? 0) : 0;
  // Računalnik: oznake delov skladbe (Intro, Verse 1, Chorus, Solo …) na drsniku
  // predvajalnika, v času posnetka. Začetek dela = najzgodnejši čas njegovih
  // vrstic (Smart play) ali posnetih akordov; del brez časov (npr. solo brez
  // natapkanih akordov) se začne s koncem zadnje zapete vrstice pred njim, del
  // na začetku pesmi pri 0.
  const sectionMarkers = useMemo(() => {
    const lines = (sync?.points ?? []).map((p) => ({ line: p.lineIndex, t: p.time + lrcOffset, end: p.end + lrcOffset }));
    const chords = chordsWrongVideo ? [] : chordPoints.filter((p): p is { t: number; line: number; chord: number } => "line" in p);
    if (!lines.length && !chords.length) return [];
    // Ponovljeni deli brez lastne številke (Chorus ×3) dobijo zaporedno: Chorus 1, 2, 3.
    const labelCount = new Map<string, number>();
    for (const l of body) if (l.kind === "section") labelCount.set(l.label, (labelCount.get(l.label) ?? 0) + 1);
    const labelSeen = new Map<string, number>();
    const out: { t: number; label: string; line: number }[] = [];
    body.forEach((l, s) => {
      if (l.kind !== "section") return;
      const nextIdx = body.findIndex((m, i) => i > s && m.kind === "section");
      const next = nextIdx < 0 ? body.length : nextIdx;
      const inside = (line: number) => line > s && line < next;
      const sung = lines.filter((p) => inside(p.line)).map((p) => p.t);
      const tapped = chords.filter((p) => inside(p.line)).map((p) => p.t);
      const before = lines.filter((p) => p.line < s);
      const sungEnd = before.length ? Math.max(...before.map((p) => p.end)) : null;
      // Del s petjem: prva zapeta vrstica (ali akord). Instrumentalni del (intro,
      // solo, outro): ko se konča petje pred njim — prvi natapkan akord pride
      // pogosto šele kasneje (Dreamer: outro 4:16, prvi C 4:22) — ali prej, če
      // je akord natapkan pred koncem vrstice.
      const t = sung.length
        ? Math.min(...sung, ...tapped)
        : tapped.length
          ? Math.min(...tapped, sungEnd ?? Infinity)
          : (sungEnd ?? 0);
      const nth = (labelSeen.get(l.label) ?? 0) + 1;
      labelSeen.set(l.label, nth);
      const numbered = (labelCount.get(l.label) ?? 0) > 1 && !/\d\s*$/.test(l.label);
      out.push({ t: Math.max(0, t), label: numbered ? `${l.label} ${nth}` : l.label, line: s });
    });
    return out.sort((a, b) => a.t - b.t);
  }, [sync, chordsWrongVideo, chordPoints, lrcOffset, body]);
  const [lrcOffsetError, setLrcOffsetError] = useState<string | null>(null);
  const saveOffsetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(saveOffsetTimerRef.current), []);
  // Vsak klik takoj velja; v bazo gre 0,7 s po zadnjem (več klikov = en zapis).
  // Preverjena skladba (Predvajalnik preverjen): zamik in seznam posnetkov sta
  // zaklenjena, dokler je ne prijaviš v "Popravi skladbe" (inFix) ali je še v
  // "Pregled in odobritev" (review_pending).
  const offsetLocked = !!verifiedPlayerAt && !inFix && !song.review_pending;
  const changeLrcOffset = (delta: number) => setLrcOffset(lrcOffset + delta);
  // Poljuben zamik (vpisan s klikom na številko), na 0,01 s natančno.
  const setLrcOffset = (seconds: number) => {
    if (!offsetVideo || offsetLocked) return;
    const next = { ...lrcOffsets, [offsetVideo]: Math.round(seconds * 100) / 100 };
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
  // Zamik podčrtanih akordov (synced_chords.sungOffset): takoj velja, v bazo gre
  // 0,7 s po zadnjem kliku; zaklenjen enako kot zamik besedila.
  const [sungOffsetOpen, setSungOffsetOpen] = useState(false);
  const saveSungTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(saveSungTimerRef.current), []);
  const setSungOffset = (seconds: number) => {
    if (!syncedChords || offsetLocked) return;
    const next: SyncedChords = { ...syncedChords, sungOffset: Math.round(seconds * 100) / 100 };
    if (!next.sungOffset) delete next.sungOffset;
    setSyncedChords(next);
    clearTimeout(saveSungTimerRef.current);
    saveSungTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("songs").update({ synced_chords: next }).eq("id", song.id);
      setLrcOffsetError(error ? error.message : null);
    }, 700);
  };
  const changeSungOffset = (delta: number) => setSungOffset(sungOffset + delta);
  const [activeLine, setActiveLine] = useState(-1);
  const [gapNextLine, setGapNextLine] = useState(-1);
  // "Sam Špili": kliknjen Play, posnetek se še nalaga.
  const [ssRequested, setSsRequested] = useState(false);
  // "Sam Špili": uporabnik je pritisnil Play (in ne Pavze) / posnetek je že kdaj
  // igral. Ko je posnetek enkrat igral, vrstice ostanejo vidne — tudi med
  // pavzo (pogled obstane, gumb Pavza postane Play) in med kratkim nalaganjem
  // ob preskoku (±5 s, na začetek).
  const [ssActive, setSsActive] = useState(false);
  const [ssHasPlayed, setSsHasPlayed] = useState(false);
  // "Sam Špili": zapeta vrstica se je končala in sledi daljši instrumentalni
  // del (interlude, solo …) — poudarek (ozadje) se odstrani do naslednje vrstice.
  // Poudarjena vrstica v "Sam Špili" (-1 = nobena, npr. med instrumentalnim
  // delom) — računa jo zanka pomikanja vsako sličico, stanje se nastavi le ob
  // spremembi, zato poudarek ne zaostaja za 250-ms onTime.
  const [ssHlLine, setSsHlLine] = useState(-1);
  // "Sam Špili": drsnik čez celo skladbo (spodaj), odpre ga gumb v stolpcu.
  const [ssSeekOpen, setSsSeekOpen] = useState(false);
  // Oznake delov na drsniku "Prevrtavanje" (Sam Špili): širina drsnika za
  // razporeditev napisov v dve vrsti (nad / pod drsnikom), kot v YouTubeMiniPlayer.
  const [ssTrackEl, setSsTrackEl] = useState<HTMLDivElement | null>(null);
  const [ssTrackW, setSsTrackW] = useState(0);
  useEffect(() => {
    if (!ssTrackEl) return;
    const ro = new ResizeObserver(() => setSsTrackW(ssTrackEl.clientWidth));
    ro.observe(ssTrackEl);
    return () => ro.disconnect();
  }, [ssTrackEl]);
  const [ssTime, setSsTime] = useState(0);
  // Sledilec (Skupni Jam) vidi vrstice, ko vodja v Sam Špili že igra.
  const ssShowLines = samSpili && (follower ? !!remote?.ss : ssHasPlayed);
  // Telefon, med pavzo: tap na vrstico skoči tja in predvaja naprej.
  const playerCtlRef = useRef<PlayerController | null>(null);
  // Računalnik (miška, ≥ 1024 px): predvajalnik pripravljen vnaprej — prvi ▶ zaigra in
  // vklopi celozaslonski način v istem kliku. Telefon: ustvari se šele ob prvem ▶.
  const [preloadPlayer] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches);
  // Glasnost posnetka po 5 % — ista v akordih v aplikaciji in v Sam Špili
  // (komadi:chords:volume; nov predvajalnik jo prevzame ob zagonu). Sam Špili:
  // ↑ / ↓ in gumba v stranski vrstici; navadni pogled: gumba v orodni vrstici.
  const [volume, setVolumeState] = useState(() => (typeof window === "undefined" ? 100 : readVolume()));
  const [ssVolMsg, setSsVolMsg] = useState<string | null>(null);
  const ssVolTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ssChangeVolume = (delta: number) => {
    const next = Math.max(0, Math.min(100, Math.round((volume + delta) / 5) * 5));
    setVolumeState(next);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(next));
    } catch {}
    playerCtlRef.current?.setVolume(next);
    showKeyMsg(`Glasnost ${next} %`);
  };
  // Kratko obvestilo na vrhu (glasnost, hitrost pomikanja s tipkovnice).
  const showKeyMsg = (msg: string) => {
    setSsVolMsg(msg);
    clearTimeout(ssVolTimerRef.current);
    ssVolTimerRef.current = setTimeout(() => setSsVolMsg(null), 1300);
  };
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
  // Vrstica v snemalniku: tap = natapkana v tem snemanju; brez nje = že
  // shranjena (synced_lines). replaced = shranjene točke iste vrstice, ki jih
  // je TAP nadomestil (razveljavitev jih vrne).
  type RecLine = { t: number; line: number; end?: number; tap?: true };
  type RecAction =
    | { kind: "line"; replaced: RecLine[] }
    | { kind: "chord"; sectionId: string }
    | { kind: "end"; sectionId: string; prev: number | null }
    // ✕ v seznamu akordov dela: odstranjena točka in njeno mesto (↶ jo vrne tja).
    | { kind: "remove"; sectionId: string; index: number; point: ChordSection["points"][number] };
  // ↷ (ponovi): razveljavljeno dejanje + kar je ↶ odstranil, da ga lahko vrne.
  // Vsako novo dejanje (TAP, akord, Konec) seznam izprazni.
  type RedoAction =
    | { kind: "line"; tap: RecLine; replaced: RecLine[] }
    | { kind: "chord"; sectionId: string; point: ChordSection["points"][number] }
    | { kind: "end"; sectionId: string; prev: number | null; end: number | null }
    | { kind: "remove"; sectionId: string; index: number; point: ChordSection["points"][number] };
  const [recorder, setRecorder] = useState<{
    lines: RecLine[];
    cursor: number;
    sections: ChordSection[];
    activeId: string | null;
    history: RecAction[];
    future: RedoAction[];
    dirty: boolean;
  } | null>(() => {
    if (!autoRecord) return null;
    // Isto kot startRecorder: nadaljuje za zadnjo že posneto vrstico.
    const lines = [...(song.synced_lines?.points ?? [])].sort((a, b) => a.t - b.t);
    const sections = song.synced_chords?.sections ?? [];
    const lastLine = lines[lines.length - 1];
    return {
      lines,
      cursor: (lastLine ? lyricLines.find((i) => i >= lastLine.line + 1) : lyricLines[0]) ?? -1,
      sections,
      activeId: sections[sections.length - 1]?.id ?? null,
      history: [],
      future: [],
      dirty: false,
    };
  });
  const [recorderMsg, setRecorderMsg] = useState<string | null>(
    autoRecord
      ? "Zaženi ▶. TAP = začetek označene vrstice. Za instrumentalni del izberi (ali dodaj) del desno in klikaj akorde, ko zazvenijo."
      : null,
  );
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
      future: [],
      dirty: false,
    });
    setSmartOn(false);
    setRecorderMsg(
      "Zaženi ▶. TAP = začetek označene vrstice. Za instrumentalni del izberi (ali dodaj) del desno in klikaj akorde, ko zazvenijo.",
    );
    closeThemeMenu();
  };
  // Prekliči snemanje (gumb v snemalniku ali "Prekliči snemanje" namesto "Posnemi čase").
  const cancelRecorder = () => {
    if (!recorder?.dirty || window.confirm("Zavržem spremembe?")) {
      setRecorder(null);
      setRecorderMsg(null);
    }
  };
  // Privzeto ime: prvi del "Intro", nato "Instrumental 1", "Instrumental 2" …
  const defaultSectionName = (sections: ChordSection[]) =>
    sections.length === 0 ? "Intro" : `Instrumental ${sections.filter((s) => s.name !== "Intro").length + 1}`;
  const addSection = () => {
    if (!recorder) return;
    const section: ChordSection = { id: newSectionId(), name: defaultSectionName(recorder.sections), offset: 0, end: null, points: [] };
    setRecorder({ ...recorder, sections: [...recorder.sections, section], activeId: section.id, dirty: true });
  };
  // −/+ zamik dela: na telefonu se spremeni offsetPhone (začne od trenutnega), na
  // računalniku offset — en zamik za računalnik, en za telefon, oba v bazi.
  const shiftSectionOffset = (s: ChordSection, delta: number): ChordSection => {
    const next = Math.round((sectionOffset(s, isPhone) + delta) * 4) / 4;
    return isPhone ? { ...s, offsetPhone: next } : { ...s, offset: next };
  };
  const updateSection = (id: string, change: (s: ChordSection) => ChordSection) => {
    if (!recorder) return;
    setRecorder({ ...recorder, sections: recorder.sections.map((s) => (s.id === id ? change(s) : s)), dirty: true });
  };
  // Preimenovanje dela na mestu: klik na ime (ali ✎) ga spremeni v polje z
  // označenim besedilom — takoj tipkaš novo ime; Enter/klik drugam shrani, Esc prekliče.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const commitRename = (id: string, value: string) => {
    setRenamingId(null);
    const name = value.trim();
    if (name && name !== recorder?.sections.find((s) => s.id === id)?.name) updateSection(id, (s) => ({ ...s, name }));
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
      future: recorder.future.filter((a) => a.kind === "line" || a.sectionId !== id),
      dirty: true,
    });
  };
  // Pregled dela: predvajaj od 2 s pred njegovim prvim akordom.
  const previewSection = (section: ChordSection) => {
    if (!section.points.length) return;
    const start = Math.min(...section.points.map((p) => p.t)) + sectionOffset(section, isPhone);
    if (!playerCtlRef.current?.seekAndPlay(Math.max(0, start - 2)))
      setRecorderMsg("Najprej enkrat zaženi posnetek z ▶.");
  };
  // Posamezni akordi dela (zložljivo pod "N akordov"): vsakemu se da premakniti
  // čas (npr. ko skill spedenaj solo natapka narobe) in ga predvajati od malo
  // pred njim. Premik spremeni samo t te točke — vrstni red v points ostane,
  // zato ↶ še vedno odstrani zadnji natapkani akord.
  const [openChordLists, setOpenChordLists] = useState<Set<string>>(() => new Set());
  const toggleChordList = (id: string) =>
    setOpenChordLists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shiftChordPoint = (sectionId: string, index: number, delta: number) =>
    updateSection(sectionId, (s) => ({
      ...s,
      points: s.points.map((p, k) => (k === index ? { ...p, t: Math.max(0, Math.round((p.t + delta) * 1000) / 1000) } : p)),
    }));
  // ✕ pri akordu: odstrani točko (↶ jo vrne na isto mesto v points).
  const removeChordPoint = (sectionId: string, index: number) => {
    if (!recorder) return;
    const point = recorder.sections.find((s) => s.id === sectionId)?.points[index];
    if (!point) return;
    setRecorder({
      ...recorder,
      sections: recorder.sections.map((s) => (s.id !== sectionId ? s : { ...s, points: s.points.filter((_, k) => k !== index) })),
      history: [...recorder.history, { kind: "remove", sectionId, index, point }],
      future: [],
      dirty: true,
    });
  };
  const previewChordAt = (t: number) => {
    if (!playerCtlRef.current?.seekAndPlay(Math.max(0, t - 1.5))) setRecorderMsg("Najprej enkrat zaženi posnetek z ▶.");
  };
  // Ime akorda na mestu (line, j) — j kot v renderLine (pri "pair" indeks kosa).
  const chordNameAt = (line: number, j: number): string => {
    const l = body[line];
    let name: string | null | undefined = null;
    if (l?.kind === "chords") name = l.chords[j]?.name;
    else if (l?.kind === "tab") name = l.header?.[j]?.name;
    else if (l?.kind === "pair") name = l.chunks[j]?.chord;
    else if (l?.kind === "text") {
      const seg = l.segments[j];
      name = seg && "chord" in seg ? seg.chord : null;
    }
    return name ? display(name) : "?";
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
  // TAP nadomesti samo čas označene vrstice: prej shranjeno točko te vrstice
  // (ne pa natapkane v tem snemanju — refren, zapet dvakrat, zapisan enkrat,
  // dobi dva tapa), vrstice brez TAP-a pa obdržijo čase (shranjene ali iz
  // LRCLIB, recordBase). Prej je en TAP + Shrani povozil celo skladbo z eno
  // samo točko. Čas brez zamika besedila, ker ga Smart play odšteje tudi
  // ročnim časom (lineProgressAt(points, čas − zamik)).
  const recordTap = () => {
    if (!recorder || recorder.cursor < 0) return;
    const t = recordTime();
    if (t == null) return;
    const line = recorder.cursor;
    const replaced = recorder.lines.filter((p) => p.line === line && !p.tap);
    setRecorder({
      ...recorder,
      lines: [...recorder.lines.filter((p) => !(p.line === line && !p.tap)), { t: Math.round((t - lrcOffset) * 100) / 100, line, tap: true }],
      cursor: nextLyricLine(line + 1),
      history: [...recorder.history, { kind: "line", replaced }],
      future: [],
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
      sections: sections.map((s) => (s.id === id ? { ...s, points: [...s.points, { t: t - sectionOffset(s, isPhone), line, chord }] } : s)),
      activeId: id,
      history: [...recorder.history, { kind: "chord", sectionId: id }],
      future: [],
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
      sections: recorder.sections.map((s) => (s.id === section.id ? { ...s, end: t - sectionOffset(s, isPhone) } : s)),
      history: [...recorder.history, { kind: "end", sectionId: section.id, prev: section.end }],
      future: [],
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
      // Zadnji TAP je vedno na koncu seznama; nadomeščene točke se vrnejo.
      const removed = recorder.lines[recorder.lines.length - 1];
      setRecorder({
        ...recorder,
        lines: [...recorder.lines.slice(0, -1), ...last.replaced],
        cursor: removed?.line ?? recorder.cursor,
        history,
        future: removed ? [...recorder.future, { kind: "line", tap: removed, replaced: last.replaced }] : recorder.future,
      });
      return;
    }
    if (last.kind === "remove") {
      setRecorder({
        ...recorder,
        sections: recorder.sections.map((s) =>
          s.id !== last.sectionId ? s : { ...s, points: [...s.points.slice(0, last.index), last.point, ...s.points.slice(last.index)] },
        ),
        activeId: last.sectionId,
        history,
        future: [...recorder.future, last],
      });
      return;
    }
    const section = recorder.sections.find((s) => s.id === last.sectionId);
    const point = section?.points[section.points.length - 1];
    const redo: RedoAction | null =
      last.kind === "chord"
        ? point
          ? { kind: "chord", sectionId: last.sectionId, point }
          : null
        : { kind: "end", sectionId: last.sectionId, prev: last.prev, end: section?.end ?? null };
    setRecorder({
      ...recorder,
      sections: recorder.sections.map((s) =>
        s.id !== last.sectionId ? s : last.kind === "chord" ? { ...s, points: s.points.slice(0, -1) } : { ...s, end: last.prev },
      ),
      activeId: last.sectionId,
      history,
      future: redo ? [...recorder.future, redo] : recorder.future,
    });
  };
  // ↷: ponovi zadnje razveljavljeno dejanje (obratno od undoTap).
  const redoTap = () => {
    const next = recorder?.future[recorder.future.length - 1];
    if (!recorder || !next) return;
    const future = recorder.future.slice(0, -1);
    if (next.kind === "line") {
      const line = next.tap.line;
      setRecorder({
        ...recorder,
        lines: [...recorder.lines.filter((p) => !(p.line === line && !p.tap)), next.tap],
        cursor: nextLyricLine(line + 1),
        history: [...recorder.history, { kind: "line", replaced: next.replaced }],
        future,
        dirty: true,
      });
      return;
    }
    if (next.kind === "remove") {
      setRecorder({
        ...recorder,
        sections: recorder.sections.map((s) => (s.id !== next.sectionId ? s : { ...s, points: s.points.filter((_, k) => k !== next.index) })),
        activeId: next.sectionId,
        history: [...recorder.history, next],
        future,
        dirty: true,
      });
      return;
    }
    setRecorder({
      ...recorder,
      sections: recorder.sections.map((s) =>
        s.id !== next.sectionId ? s : next.kind === "chord" ? { ...s, points: [...s.points, next.point] } : { ...s, end: next.end },
      ),
      activeId: next.sectionId,
      history: [
        ...recorder.history,
        next.kind === "chord" ? { kind: "chord", sectionId: next.sectionId } : { kind: "end", sectionId: next.sectionId, prev: next.prev },
      ],
      future,
      dirty: true,
    });
  };
  // Osnutek med snemanjem: obarvanje po vseh delih (za pregled z ▶) in
  // podčrtani akordi aktivnega dela.
  const draftChordPoints = useMemo(() => flattenChordSections(recorder?.sections ?? [], isPhone), [recorder, isPhone]);
  const recordedChords = useMemo(() => {
    const active = recorder?.sections.find((s) => s.id === recorder.activeId);
    return new Set(active?.points.map((p) => `${p.line}:${p.chord}`) ?? []);
  }, [recorder]);
  // Ključ vrstice ob shranjevanju časa — po njem se čas kasneje prestavi.
  const withLineKey = <T extends { line: number }>(p: T): T & { key?: string } => {
    const key = lineKey(body[p.line]);
    return key ? { ...p, key } : p;
  };
  // Izhodišče snemanja, kadar skladba še nima shranjenih časov vrstic: časi iz
  // LRCLIB. Vrstice brez TAP-a jih ob shranjevanju obdržijo.
  const recordBase = !syncedLines?.points.length && sync && !sync.manual ? sync.points : [];
  // Posnetek, za katerega se shranijo časi: ta, ki igra, sicer tisti, za katerega
  // so časi že shranjeni (na telefonu "playingVideo" ob vrnitvi ni vedno znan).
  const recordVideoId = playingVideo ?? syncedLines?.videoId ?? syncedChords?.videoId ?? null;
  const saveRecorder = async () => {
    if (!recorder?.dirty || !recordVideoId) return;
    // Časi vrstic se shranijo le, če je bil kakšen TAP ali so že bili shranjeni —
    // samo akordi (Water Witch) pustijo vrstice iz LRCLIB pri miru.
    const hasTaps = recorder.lines.some((p) => p.tap);
    const own = recorder.lines.map((p) => ({ t: p.t, line: p.line, ...(p.end !== undefined ? { end: p.end } : {}) }));
    const taken = new Set(recorder.lines.map((p) => p.line));
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const merged =
      hasTaps || syncedLines?.points.length
        ? [...own, ...recordBase.filter((p) => !taken.has(p.lineIndex)).map((p) => ({ t: r2(p.time), end: r2(p.end), line: p.lineIndex }))]
        : [];
    const linePoints = merged.sort((a, b) => a.t - b.t).map(withLineKey);
    const sections = recorder.sections.filter((s) => s.points.length).map((s) => ({ ...s, points: s.points.map(withLineKey) }));
    // Shrani samo plasti, ki imajo točke (ali so jih imele): Water Witch s
    // samimi akordi pusti vrstice iz LRCLIB pri miru.
    const nextLines = linePoints.length ? { videoId: syncedLines?.videoId ?? recordVideoId, points: linePoints } : null;
    // ...syncedChords: ohrani dodatna polja (sungUnderline).
    const nextChords = sections.length ? { ...syncedChords, videoId: syncedChords?.videoId ?? recordVideoId, sections } : null;
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

  // --- Ročno preverjanje (oznaki na kartici, pogoj za "Odobri") ---
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const verifyError = (message: string) =>
    setVerifyMsg(`Shranjevanje ni uspelo: ${message}${/verified_/.test(message) ? " — poženi migracijo 0035_add_verification.sql v Supabase." : ""}`);
  // "Predvajalnik preverjen": zamrzne trenutne čase vrstic (s koncem in ključem
  // vrstice), posnetek, ki igra, in s tem njegov zamik (lrc_offsets) — skladba
  // potem ne rabi več LRCLIB in je ne spremeni kasnejša logika povezovanja.
  // markVerified = false: samodejna zamrznitev skladbe, ki je bila označena kot
  // preverjena brez predvajanja (gumb na strani Pregled in odobritev) — oznaka
  // ostane, zamrznejo se časi in posnetek, ki zdaj igra.
  const freezePlayer = async (markVerified: boolean) => {
    if (!playingVideo || !sync?.points.length) return;
    if (sync.manual && syncedLines && syncedLines.videoId !== playingVideo) {
      if (markVerified) setVerifyMsg("Časi so posneti za drug posnetek — izberi tistega ali posnemi čase znova.");
      return;
    }
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    const nextLines: SyncedLines = {
      videoId: playingVideo,
      frozen: true,
      points: sync.points.map((p) => withLineKey({ t: r3(p.time), end: r3(p.end), line: p.lineIndex })),
    };
    const nextChords: SyncedChords | null = syncedChords
      ? { ...syncedChords, sections: chordSections.map((s) => ({ ...s, points: s.points.map(withLineKey) })) }
      : null;
    const at = new Date().toISOString();
    const video = playingVideo;
    const { error } = await supabase
      .from("songs")
      .update({
        synced_lines: nextLines,
        preferred_video_id: video,
        ...(markVerified ? { verified_player_at: at } : {}),
        ...(nextChords ? { synced_chords: nextChords } : {}),
      })
      .eq("id", song.id);
    if (error) return verifyError(error.message);
    setSyncedLines(nextLines);
    if (nextChords) setSyncedChords(nextChords);
    setPreferredVideo(video);
    if (markVerified) setVerifiedPlayerAt(at);
    setVerifyMsg(null);
  };
  // Samodejna zamrznitev: skladba je označena kot preverjena, časi pa še niso
  // zamrznjeni — ob prvem predvajanju s časi se zaklenejo (enkrat na odprtje).
  const autoFrozeRef = useRef(false);
  const freezeRef = useRef(freezePlayer);
  useEffect(() => {
    freezeRef.current = freezePlayer;
  });
  const needsFreeze = !!verifiedPlayerAt && !syncedLines?.frozen && !!playingVideo && !!sync?.points.length && !recorder;
  useEffect(() => {
    if (!needsFreeze || autoFrozeRef.current) return;
    autoFrozeRef.current = true;
    void freezeRef.current(false);
  }, [needsFreeze]);
  // Zaporedje nasveta v vrsticah po 3–4 akorde (enakomerno: 14 → 4 + 4 + 3 + 3), da je pregledno.
  const tipRows = (names: string[]) => {
    const rows = Math.ceil(names.length / 4);
    const out: string[][] = [];
    let at = 0;
    for (let r = 0; r < rows; r++) {
      const n = Math.ceil((names.length - at) / (rows - r));
      out.push(names.slice(at, at + n));
      at += n;
    }
    return (
      <div className="mt-1 space-y-0.5 font-mono text-lg font-bold text-(--cv-chord) lg:text-xl">
        {out.map((row, i) => (
          <p key={i} className="whitespace-pre">
            {row.join("  →  ")}
            {i < out.length - 1 && <span className="text-(--cv-muted)">  →</span>}
          </p>
        ))}
      </div>
    );
  };
  // Prijemi akordov za vrstico nasveta (vsak akord enkrat, izbrana različica kot drugod).
  const tipShapeRow = (names: string[]) => (
    <div className="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto pb-1 opacity-90 [scrollbar-width:thin] [zoom:0.75]">
      {[...new Set(names)].map((name) => {
        const positions = mergeShapes(descShapes.get(name), chordDb ? findChordShapes(chordDb, name) : []);
        const position = positions[Math.min(shapeChoice[name] ?? 0, Math.max(0, positions.length - 1))];
        return position ? (
          <ChordDiagram key={name} name={name} position={position} />
        ) : (
          <span key={name} className="px-1 text-sm font-bold text-(--cv-chord)" title="Prijem ni znan">
            {name}
          </span>
        );
      })}
    </div>
  );
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
    // Klik ali tap na vrstico z besedilom skoči tja — tudi med predvajanjem in z
    // miško. Sledilec (Skupni Jam) nima svojega zvoka; označevanje besedila
    // (izbira z miško) ne skače.
    if (!sync || follower) return;
    if (window.getSelection()?.toString()) return;
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
  // "Sam Špili": tap (prst ali miška) na vrstico skoči tja — tudi med
  // predvajanjem. Vrstica z besedilom: njen začetek (pri ponovljenem refrenu
  // ponovitev, časovno najbližja trenutnemu mestu). Instrumentalna vrstica
  // (intro, interlude): začetek tega dela = konec prejšnje zapete vrstice,
  // pred prvo zapeto vrstico začetek skladbe.
  const ssSeekToLine = (lineIndex: number, e: React.MouseEvent) => {
    if (!sync) return;
    if ((e.target as HTMLElement).closest("[data-chord-name],button,a")) return;
    const now = playbackRef.current.time - lrcOffset;
    const nearest = (pred: (p: { time: number; end: number; lineIndex: number }) => boolean) => {
      let best = -1;
      sync.points.forEach((p, k) => {
        if (!pred(p)) return;
        if (best < 0 || Math.abs(p.time - now) < Math.abs(sync.points[best].time - now)) best = k;
      });
      return best;
    };
    let seconds: number;
    let k = nearest((p) => p.lineIndex === lineIndex);
    if (k >= 0) {
      while (k > 0 && sync.points[k - 1].lineIndex === lineIndex) k--;
      seconds = sync.points[k].time + lrcOffset - 0.3;
    } else {
      // Instrumentalna vrstica: zadnja zapeta vrstica pred njo (najbližja ponovitev).
      const prevLine = Math.max(-1, ...sync.points.filter((p) => p.lineIndex < lineIndex).map((p) => p.lineIndex));
      if (prevLine < 0) seconds = 0;
      else {
        let j = nearest((p) => p.lineIndex === prevLine);
        while (j + 1 < sync.points.length && sync.points[j + 1].lineIndex === prevLine) j++;
        seconds = sync.points[j].end + lrcOffset;
      }
    }
    if (playerCtlRef.current?.seekAndPlay(Math.max(0, seconds))) {
      setSmartOn(true);
      setSsActive(true);
    }
  };
  const onVideoTime = (seconds: number, duration: number, playing: boolean) => {
    playbackRef.current = { time: seconds, playing };
    if (playing) {
      setSsRequested(false);
      setSsHasPlayed(true);
    }
    if (duration && Math.abs(duration - videoDuration) > 1) setVideoDuration(duration);
    // "Sam Špili": zadnji čas + trenutek prejema; zanka pomikanja iz tega
    // sproti izračuna čas med 250-ms osvežitvami (gladko, brez stopnic).
    ssClockRef.current = { t: seconds, at: performance.now(), playing, rate: ssClockRef.current.rate };
    // Drsnik prevrtavanja: ponovni izris le, ko je odprt (sicer vsakih 250 ms
    // ves pregledovalnik — zatikanje pomikanja).
    if (samSpili && ssSeekOpen) setSsTime(seconds);
    // Med predvajanjem oznake računa zanka spodaj (vsako sličico, interpoliran
    // čas); tu le ob pavzi/preskoku, ko zanka ne teče.
    if (!playing) applyTimingRef.current(seconds);
  };
  // Oznaka vrstice in akorda za čas posnetka t (sekunde, brez zamika LRC).
  // Akordi: čas brez zamika LRC (vsak del ima svoj zamik); med snemanjem po
  // osnutku, da se pregled z ▶ takoj vidi. Med instrumentalnim delom (solo,
  // outro) ni označene vrstice — kot v Sam Špili.
  const timingRef = useRef({
    points: null as SyncPoint[] | null,
    offset: 0,
    chordPts: [] as ReturnType<typeof flattenChordSections>,
  });
  useEffect(() => {
    timingRef.current = {
      points: smartActive && sync ? sync.points : null,
      offset: lrcOffset,
      chordPts: recorder ? draftChordPoints : smartActive ? liveChordPoints : [],
    };
  });
  const applyTiming = (t: number) => {
    const { points, offset, chordPts } = timingRef.current;
    const gapInfo = points ? instrumentalGapAt(points, t - offset, SS_GAP_MIN) : null;
    const line = points ? (gapInfo ? -1 : lineProgressAt(points, t - offset).lineIndex) : -1;
    setActiveLine((prev) => (prev === line ? prev : line));
    const ahead = gapInfo && gapInfo.progress >= 0.5 ? gapInfo.nextLine : -1;
    setGapNextLine((prev) => (prev === ahead ? prev : ahead));
    const chord = chordPts.length ? chordAt(chordPts, t) : null;
    setActiveChord((prev) => (prev?.line === chord?.line && prev?.chord === chord?.chord ? prev : chord));
    const also = chord ? chordsAt(chordPts, t).map((c) => `${c.line}:${c.chord}`).join(" ") : "";
    setActiveChordsAlso((prev) => (prev === also ? prev : also));
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
    leaderReportRef.current({ anchor: computeAnchor(el), ...leaderViewRef.current, ...(ssLastRef.current ? { ss: ssLastRef.current } : {}) });
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
  // Sledilec: na vrhu ista vrstica kot pri vodji. Sporočilo da samo cilj;
  // pomik proti njemu je gladek (vsaka sličica, eksponentno približevanje),
  // namesto skoka ob vsakem sporočilu (~10/s), ki je bil sunkovit.
  // Cilj = zadnji vodjev položaj + njegova hitrost (px/s), da sledilec med
  // sporočili drsi naprej kot vodja, namesto da skače od cilja do cilja.
  const followTargetRef = useRef<{ base: number; v: number; at: number } | null>(null);
  const lastAnchorRef = useRef<LocalView["anchor"] | null>(null);
  const setFollowAnchor = useCallback((anchor: LocalView["anchor"], at: number, keepSpeed: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const base = anchorScrollTop(el, anchor);
    lastAnchorRef.current = anchor;
    if (base == null) return;
    const prev = followTargetRef.current;
    let v = 0;
    if (keepSpeed && prev) {
      const dt = (at - prev.at) / 1000;
      if (dt > 0.02 && dt < 1.5 && Math.abs(base - prev.base) < el.clientHeight) v = prev.v * 0.4 + ((base - prev.base) / dt) * 0.6;
    }
    followTargetRef.current = { base, v, at };
  }, []);
  // Druga velikost pisave: isto sidro, nov položaj v px.
  useEffect(() => {
    if (lastAnchorRef.current) setFollowAnchor(lastAnchorRef.current, performance.now(), false);
  }, [fontSize, setFollowAnchor]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isFollowing) return;
    // Dotik/kolesce sledilca: 3 s brez sledenja, nato gladko nazaj k vodji.
    let userUntil = 0;
    const mark = () => {
      userUntil = performance.now() + 3000;
    };
    el.addEventListener("touchstart", mark, { passive: true });
    el.addEventListener("wheel", mark, { passive: true });
    // Natančen (necel) položaj — brskalnik scrollTop zaokroži na piksle.
    let pos = el.scrollTop;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const ft = followTargetRef.current;
      // + zakasnitev sledilcev (Nastavitve Jama): prehiti vodjo za zamik sporočil.
      const lead = readFollowerLead();
      const target = ft ? ft.base + ft.v * (Math.min(0.3, (now - ft.at) / 1000) + lead) : null;
      const dt = Math.min(100, now - last);
      last = now;
      if (target != null && now >= userUntil) {
        if (Math.abs(el.scrollTop - Math.round(pos)) > 2) pos = el.scrollTop;
        const diff = target - pos;
        // Velik skok (nova skladba, drug del pesmi): takoj, brez dolge animacije.
        if (Math.abs(diff) > el.clientHeight * 1.5 || Math.abs(diff) < 0.3) pos = target;
        else pos += diff * (1 - Math.exp(-dt / 120));
        if (Math.round(pos) !== el.scrollTop) el.scrollTop = pos;
      } else pos = el.scrollTop;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("touchstart", mark);
      el.removeEventListener("wheel", mark);
    };
  }, [isFollowing]);
  // Vodja izstopi iz celozaslonskega načina → tudi sledilec (če je vstopil).
  // Ne v Sam Špili: tam si sledilec celozaslonski način vklopi sam (prvi dotik),
  // vodja ga pogosto nima (računalnik) — sicer bi ga vsako sporočilo vrglo ven.
  const remoteFullscreen = !!remote?.fullscreen;
  useEffect(() => {
    if (!remoteFullscreen && follower && !samSpili && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [remoteFullscreen, follower, samSpili]);
  // Med instrumentalnim delom (brez natapkanih akordov): od polovice premora se
  // pogled že pomakne na vrstico za njim (gapNextLine), da ni treba čakati konca sola.
  const scrollLine = follower ? -1 : activeChord ? activeChord.line : activeLine >= 0 ? activeLine : gapNextLine;
  // Kar je označeno: pri sledilcu vodjev Smart play, sicer lasten.
  const shownLine = follower ? (remote?.smart?.line ?? -1) : smartActive ? activeLine : -1;
  const shownChord = follower ? (remote?.smart?.chord ?? null) : activeChord;
  // Impro "Trenutna": obarvani (natapkani) akord, sicer prvi akord vrstice, ki se poje,
  // oz. zadnji akord pred njo (vrstica brez akordov). Imena kot v improChords.
  const improCurrentChord = (() => {
    if (!improOpen) return null;
    const lineChords = (i: number): (string | null)[] => {
      const line = body[i];
      if (!line) return [];
      if (line.kind === "chords") return line.chords.map((c) => c.name);
      if (line.kind === "pair") return line.chunks.map((c) => c.chord);
      if (line.kind === "text") return line.segments.map((s) => ("chord" in s ? s.chord : null));
      if (line.kind === "tab") return line.header?.map((c) => c.name) ?? [];
      return [];
    };
    let raw: string | null = shownChord ? (lineChords(shownChord.line)[shownChord.chord] ?? null) : null;
    if (!raw && shownLine >= 0) {
      raw = lineChords(shownLine).find((c) => c) ?? null;
      for (let i = shownLine - 1; !raw && i >= 0; i--) raw = lineChords(i).filter((c) => c).pop() ?? null;
    }
    if (!raw) return null;
    const t = transposeChord(raw, chordShift);
    return simplify ? simplifyChord(t) : t;
  })();
  // Ročno pomikanje (dotik, kolesce) za 4 s ustavi samodejno sledenje.
  const lastUserScrollRef = useRef(0);
  // Klik na oznako dela na drsniku: naslov dela tik pod lepljivi zgornji vrstici
  // (tudi ko se ne predvaja); samodejno sledenje počaka 4 s, da ga ne potegne nazaj.
  const scrollToSection = (lineIndex?: number) => {
    const el = scrollRef.current;
    const line = lineIndex == null ? null : el?.querySelector<HTMLElement>(`[data-line="${lineIndex}"]`);
    if (!el || !line) return;
    requestAnimationFrame(() => {
      lastUserScrollRef.current = Date.now();
      const bars = barsOuterRef.current?.offsetHeight ?? 0;
      const top = el.scrollTop + line.getBoundingClientRect().top - el.getBoundingClientRect().top - bars - 20;
      el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  };
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

  // --- "Sam Špili": 3 vrstice čez cel zaslon ---
  // Prikazljive vrstice pesmi: brez razdelkov, praznih vrstic in tablatur brez
  // vrstice akordov (te so v pesmi skrite). Instrumentalne vrstice (samo akordi)
  // ostanejo, da se tudi intro/interlude kaže po 3 vrstice.
  // Prikazane vrstice; label = oznaka odseka (Intro, Verse, Chorus …) tik
  // pred vrstico, prikazana nad njo kot v navadnem pogledu.
  const ssLines = useMemo(() => {
    const out: { l: ChordsLine; i: number; label?: string }[] = [];
    let label: string | undefined;
    body.forEach((l, i) => {
      if (l.kind === "section") {
        label = l.label;
        return;
      }
      if (l.kind === "tab" && !l.header) return;
      if (l.kind === "text" && !l.segments.some((sg) => "chord" in sg || sg.text.trim() !== "")) return;
      out.push({ l, i, label });
      label = undefined;
    });
    return out;
  }, [body]);
  // Neprekinjeno pomikanje (kot samodejno pomikanje): vidnih je ~4 vrstice,
  // trenutna (Smart play) je ob začetku v 2. vrstici, med petjem se pogled
  // sorazmerno s časom pomika navzgor, da je ob koncu vrstice v 2. vrstici že
  // naslednja. Pred prvo zapeto vrstico (intro) je pogled na vrhu.
  const ssBoxRef = useRef<HTMLDivElement>(null);
  const ssLinesRef = useRef<HTMLDivElement>(null);
  // Napredek znotraj trenutne vrstice (0–1) iz lineProgressAt, osvežen ob
  // vsakem času posnetka; zanka pomikanja ga bere vsako sličico.
  // rate = hitrost predvajanja ("Hitrost"): video čas teče rate × hitreje od pravega.
  const ssClockRef = useRef({ t: 0, at: 0, playing: false, rate: 1 });
  // Nova hitrost: interpolacija (zanke oznak in Sam Špili) takoj od trenutnega časa naprej.
  useEffect(() => {
    const c = ssClockRef.current;
    ssClockRef.current = { ...c, t: playerCtlRef.current?.currentTime() ?? c.t, at: performance.now(), rate: playbackRate };
  }, [playbackRate]);
  // Oznake vrstice/akorda med predvajanjem: čas, interpoliran od zadnje osvežitve
  // predvajalnika (vsakih ~250 ms, na telefonu lahko redkeje), vsako sličico —
  // sicer je oznaka akorda zamujala do pol sekunde (outro One Step Forward).
  const applyTimingRef = useRef<(t: number) => void>(() => {});
  useEffect(() => {
    applyTimingRef.current = applyTiming;
  });
  useEffect(() => {
    let raf = 0;
    let shownT = -1;
    const tick = (now: number) => {
      const clock = ssClockRef.current;
      if (clock.playing) {
        // Največ 0,6 s naprej brez nove osvežitve (zastoj); nova osvežitev,
        // malo za oceno, ne vrne nazaj za drobce — večji skok (previjanje) velja.
        let t = clock.t + Math.min(0.6, ((now - clock.at) / 1000) * clock.rate);
        if (t < shownT && shownT - t < 0.3) t = shownT;
        shownT = t;
        applyTimingRef.current(t);
      } else shownT = -1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ssSyncRef = useRef<{ points: SyncPoint[] | null; offset: number }>({ points: null, offset: 0 });
  const ssDurationRef = useRef(0);
  useEffect(() => {
    ssSyncRef.current = { points: smartActive && sync ? sync.points : null, offset: lrcOffset };
    ssDurationRef.current = videoDuration;
  });
  const smoothScroll = SMOOTH_SCROLL_TEST_TITLES.includes(song.title.trim().toLowerCase());
  // Skupni Jam: vodja v Sam Špili pošilja položaj iz zanke pomikanja (zadnji je
  // v ssLastRef, da ga pošlje tudi reportView); sledilec ga bere iz
  // ssRemoteRef (+ trenutek prejema) namesto lastnega časa posnetka.
  const ssLastRef = useRef<SamSpiliView | null>(null);
  const ssRemoteRef = useRef<{ view: SamSpiliView; at: number } | null>(null);
  // Sledilec: vsako sporočilo vodje gre v refe (položaj, Sam Špili); stanje se
  // spremeni samo, ko se spremeni kaj, kar se izriše.
  const isFollower = !!follower;
  useEffect(() => {
    if (!isFollower) return;
    const onEntry = (entry: RemoteViewEntry | null) => {
      const v = entry && entry.songId === song.id ? entry.view : null;
      ssRemoteRef.current = v?.ss ? { view: v.ss, at: entry!.at } : null;
      if (v) setFollowAnchor(v.anchor, entry!.at, true);
      setRemoteState((prev) => {
        if (!prev || !v) return v;
        const same =
          prev.fullscreen === v.fullscreen &&
          !!prev.ss === !!v.ss &&
          (prev.smart?.line ?? -2) === (v.smart?.line ?? -2) &&
          (prev.smart?.chord?.line ?? -2) === (v.smart?.chord?.line ?? -2) &&
          (prev.smart?.chord?.chord ?? -2) === (v.smart?.chord?.chord ?? -2);
        return same ? prev : v;
      });
    };
    // Ob (ponovnem) sledenju takoj zadnji znani pogled, ne šele ob naslednjem sporočilu.
    const unsubscribe = subscribeRemoteView(onEntry);
    const initial = getRemoteView();
    if (initial) queueMicrotask(() => onEntry(initial));
    return unsubscribe;
  }, [isFollower, song.id, setFollowAnchor]);
  // Velikost pisave (enkrat za skladbo in ob spremembi velikosti zaslona):
  // najdaljša vrstica zapolni širino (do črte), po višini pa gredo ~3 vrstice. Merjeno
  // pri 20 px in linearno povečano; nastavljeno neposredno na element. Pri 100 % se
  // nobena vrstica ne prelomi; ko jo povečava (− / + ali pinch) potisne čez desni
  // rob, blok dobi širino okvirja in akordi z besedilom se prelomijo v novo vrstico.
  useEffect(() => {
    const box = ssBoxRef.current;
    const inner = ssLinesRef.current;
    if (!samSpili || !box || !inner || !ssLines.length) return;
    const fit = () => {
      // Razpoložljiva širina/višina = okvir BREZ odmikov (clientWidth jih
      // vključuje — brez odštevanja so dolge vrstice na desni odrezane).
      const cs = getComputedStyle(box);
      const availW = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      inner.style.width = "";
      inner.style.fontSize = "20px";
      const w = inner.scrollWidth;
      const rows = [...inner.querySelectorAll<HTMLElement>("[data-ss-line]")];
      const avgH = rows.reduce((h, r) => h + r.offsetHeight, 0) / Math.max(1, rows.length);
      if (!w || !avgH || availW <= 0) return;
      const k = Math.min(availW / w, availH / (3 * avgH));
      let size = Math.max(14, Math.floor(20 * k));
      inner.style.fontSize = `${size}px`;
      // Preverjanje: če najširša vrstica (krepki akordi, zaokroževanje) še
      // gleda čez, pisavo zmanjšuj po 1 px, dokler ne gre vse v širino.
      while (size > 14 && inner.scrollWidth > availW) {
        size -= 1;
        inner.style.fontSize = `${size}px`;
      }
      // Ročni popravek (gumba − / +, pinch): kar bi gledalo čez desni rob, se prelomi.
      if (ssScale !== 1) inner.style.fontSize = `${Math.round(size * ssScale)}px`;
      // Ležeče: ob povečavi se prelomi malo prej (7 % pred desnim robom), da besedilo
      // ne sega čisto do gumbov ob robu.
      const wrapW = ssScale > 1 && !portrait ? Math.floor(availW * 0.93) : availW;
      if (inner.scrollWidth > wrapW) inner.style.width = `${wrapW}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [samSpili, ssLines, ssShowLines, ssScale, portrait]);
  // Zanka pomikanja: cilj = trenutna vrstica v 2. vrstici + napredek proti
  // naslednji. Vsako sličico: čas posnetka interpoliran od zadnjega onTime,
  // vrstica/napredek izračunana sproti, premik s transform (podpiksli, brez
  // zaokroževanja scrollTop), geometrija vrstic predpomnjena.
  useEffect(() => {
    const box = ssBoxRef.current;
    const inner = ssLinesRef.current;
    // Teče tudi med kratkim nalaganjem ob preskoku, da se pogled gladko premakne.
    if (!ssShowLines || !box || !inner) return;
    box.scrollTop = 0;
    // Položaji vrstic: izmerjeni enkrat in ob spremembi velikosti (pisava).
    let tops: number[] = [];
    let slot = 0;
    let boxH = box.clientHeight;
    // Enakomerno pomikanje (SMOOTH_SCROLL_TEST_TITLES): prefiksne vsote krivulje
    // položaja, vzorčene na SS_SMOOTH_STEP; zgradi se znova ob novih časih,
    // dolžini videa ali merjenju (pisava, velikost okna).
    let smooth: { points: SyncPoint[]; duration: number; pre: Float64Array; n: number } | null = null;
    const measure = () => {
      smooth = null;
      // Merjena je vrstica sama (ne oznaka odseka nad njo).
      const rows = [...inner.querySelectorAll<HTMLElement>("[data-ss-line]")];
      tops = rows.map((r) => r.offsetTop);
      // Stalen odmik ene "vrstice" nad trenutno (mediana višin) — z višino
      // prejšnje vrstice (samo akordi = pol nižja) je pogled skočil nazaj.
      const heights = rows.map((r) => r.offsetHeight).sort((x, y) => x - y);
      // Med vrstico pogled zdrsne za eno vrstico, zato je njena sredina na
      // polovici napredka ≈ slot od vrha vsebine.
      const cs = getComputedStyle(box);
      const availH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      slot = Math.max((heights[Math.floor(heights.length / 2)] ?? 0) * SS_SLOT_ROWS, SS_CENTER * availH);
      boxH = box.clientHeight;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    ro.observe(box);
    // Indeks v ssLines za vrstico telesa pesmi.
    const rowOf = new Map<number, number>();
    ssLines.forEach(({ i }, k) => rowOf.set(i, k));
    const rowFor = (line: number) => {
      if (line < 0) return -1;
      const k = rowOf.get(line);
      return k ?? ssLines.findIndex(({ i }) => i >= line);
    };
    let pos = NaN;
    let shownT = 0;
    let hl = -2;
    let last = performance.now();
    let raf = 0;
    // Vodja: zadnje poslano stanje.
    let sentAt = 0;
    let sent: SamSpiliView | null = null;
    const rowTarget = (rowPos: number) => {
      if (rowPos < 0) return 0;
      const k = Math.floor(rowPos);
      if (tops[k] === undefined) return tops.length ? Math.max(0, tops[tops.length - 1] - slot) : 0;
      const step = tops[k + 1] !== undefined ? tops[k + 1] - tops[k] : 0;
      return Math.max(0, tops[k] - slot + step * (rowPos - k));
    };
    // Sidra: (začetek zapete vrstice, njen položaj) — samo naprej; vmes linearno,
    // zato se vrstice intra/sola prečkajo enakomerno. Na koncu videa zadnja vrstica.
    const buildSmooth = (points: SyncPoint[], duration: number) => {
      const anchors: [number, number][] = [[0, 0]];
      for (const p of points) {
        const [lt, ly] = anchors[anchors.length - 1];
        const y = rowTarget(rowFor(p.lineIndex));
        if (p.time > lt && y > ly) anchors.push([p.time, y]);
      }
      const [lastT, lastY] = anchors[anchors.length - 1];
      const end = Math.max(duration, lastT + SS_SMOOTH_SEC);
      const endY = rowTarget(ssLines.length - 1);
      if (endY > lastY) anchors.push([end, endY]);
      const n = Math.ceil(end / SS_SMOOTH_STEP) + 1;
      const pre = new Float64Array(n + 1);
      let a = 0;
      for (let i = 0; i < n; i++) {
        const t = i * SS_SMOOTH_STEP;
        while (a + 1 < anchors.length && anchors[a + 1][0] <= t) a++;
        const [t0, y0] = anchors[a];
        const next = anchors[a + 1];
        const y = next ? y0 + ((next[1] - y0) * (t - t0)) / (next[0] - t0) : y0;
        pre[i + 1] = pre[i] + y;
      }
      return { points, duration, pre, n };
    };
    // Povprečje krivulje v oknu ±SS_SMOOTH_SEC/2 okoli časa t (na robovih ožje).
    const smoothPos = (t: number) => {
      const s = smooth!;
      const half = Math.round(SS_SMOOTH_SEC / 2 / SS_SMOOTH_STEP);
      const avgAt = (c: number) => {
        const i0 = Math.max(0, c - half);
        const i1 = Math.min(s.n - 1, c + half);
        return i1 < i0 ? 0 : (s.pre[i1 + 1] - s.pre[i0]) / (i1 - i0 + 1);
      };
      const x = Math.min(s.n - 1, Math.max(0, t / SS_SMOOTH_STEP));
      const c = Math.floor(x);
      return avgAt(c) + (avgAt(c + 1) - avgAt(c)) * (x - c);
    };
    // Piksel → delna vrstica (obratno od rowTarget), za sporočila vodje.
    const rowAtPx = (y: number) => {
      const target = y + slot;
      if (!tops.length || target <= tops[0]) return 0;
      let k = 0;
      while (k + 1 < tops.length && tops[k + 1] <= target) k++;
      const step = tops[k + 1] !== undefined ? tops[k + 1] - tops[k] : 0;
      return step > 0 ? k + (target - tops[k]) / step : k;
    };
    // Ročno pomikanje (prst ali kolešček), tudi med predvajanjem: ko začneš
    // pomikati, samodejno sledenje obstane (pogled ostane, kamor ga postaviš);
    // SS_USER_HOLD ms po zadnjem dotiku se gladko vrne k mestu, ki se poje.
    // Vlečenje ni tap (ne skoči na vrstico).
    let userPos: number | null = null;
    let returning = false;
    let lastUserAt = -Infinity;
    let drag: { id: number; y: number; start: number; moved: boolean; lastY: number; lastAt: number; v: number } | null = null;
    // Zalet po spustu (px/ms), pojema.
    let fling = 0;
    let suppressClick = false;
    const maxPos = () => Math.max(0, (tops[tops.length - 1] ?? 0) + slot);
    const clampPos = (x: number) => Math.min(maxPos(), Math.max(0, x));
    // Pinch: dva prsta = povečava besedila (velikost kot gumba + / −), ne pomikanje.
    const touches = new Map<number, number[]>();
    let pinch: { d0: number; scale0: number } | null = null;
    const touchDist = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
    };
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        pinch = { d0: Math.max(1, touchDist()), scale0: ssScaleRef.current };
        drag = null;
        fling = 0;
        suppressClick = true;
      }
    };
    const onTouchMove = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && touches.size >= 2) {
        const next = pinch.scale0 * (touchDist() / pinch.d0);
        if (Math.abs(next - ssScaleRef.current) >= 0.02) setSsScaleToRef.current(next);
      }
    };
    const onTouchUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
    };
    box.addEventListener("pointerdown", onTouchDown);
    window.addEventListener("pointermove", onTouchMove);
    window.addEventListener("pointerup", onTouchUp);
    window.addEventListener("pointercancel", onTouchUp);
    const onDown = (e: PointerEvent) => {
      if (pinch || touches.size > 1) return;
      fling = 0;
      // Po vlečenju telefon klika ne sproži — zastavica ne sme pojesti naslednjega tapa.
      suppressClick = false;
      drag = { id: e.pointerId, y: e.clientY, start: Number.isNaN(pos) ? 0 : pos, moved: false, lastY: e.clientY, lastAt: performance.now(), v: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || pinch) return;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) < 8) return;
      drag.moved = true;
      returning = false;
      userPos = clampPos(drag.start - dy * SS_DRAG_GAIN);
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastAt);
      drag.v = 0.8 * drag.v + 0.2 * ((-(e.clientY - drag.lastY) * SS_DRAG_GAIN) / dt);
      drag.lastY = e.clientY;
      drag.lastAt = now;
      lastUserAt = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        suppressClick = true;
        lastUserAt = performance.now();
        // Hiter potek prsta ob spustu = zalet (le, če se je prst še premikal).
        if (performance.now() - drag.lastAt < 80) fling = drag.v;
      } else if (userPos !== null) {
        // Tap (skok na vrstico) med ustavljenim sledenjem: takoj nazaj k skladbi.
        userPos = null;
        returning = true;
      }
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      returning = false;
      userPos = clampPos((userPos ?? (Number.isNaN(pos) ? 0 : pos)) + e.deltaY * SS_WHEEL_GAIN);
      lastUserAt = performance.now();
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    box.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    box.addEventListener("wheel", onWheel, { passive: true });
    box.addEventListener("click", onClickCapture, true);
    const ease = (target: number, dt: number) => {
      const now = performance.now();
      // Zalet po spustu prsta: nadaljuje v isti smeri in pojema (~0,3 s).
      if (!drag && fling !== 0 && userPos !== null) {
        const next = clampPos(userPos + fling * dt);
        if (next === userPos) fling = 0;
        userPos = next;
        fling *= Math.exp(-dt / 300);
        if (Math.abs(fling) < 0.02) fling = 0;
        lastUserAt = now;
      }
      // Med ročnim pomikanjem pogled stoji, kjer ga je pustil uporabnik.
      if (userPos !== null) {
        if (drag || now - lastUserAt <= SS_USER_HOLD) {
          pos = userPos;
          inner.style.transform = `translate3d(0, ${-pos}px, 0)`;
          return;
        }
        // Po SS_USER_HOLD ms brez dotika: gladek povratek k skladbi.
        userPos = null;
        returning = true;
      }
      const diff = target - pos;
      if (returning) {
        // Povratek (~0,4 s), tudi čez velike razdalje; nato običajno sledenje.
        pos += diff * (1 - Math.exp(-dt / 400));
        if (Math.abs(diff) < 1) returning = false;
      } else if (Number.isNaN(pos) || Math.abs(diff) > boxH * 1.5 || Math.abs(diff) < 0.05) pos = target;
      // Kratko glajenje (cilj se premika zvezno, zato majhna zamuda).
      else pos += diff * (1 - Math.exp(-dt / 110));
      inner.style.transform = `translate3d(0, ${-pos}px, 0)`;
    };
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      // Sledilec: vodjev položaj — napredek v vrstici raste linearno kot pri
      // vodji (p + rate × čas od prejema), zato drsi enako gladko. Največ 3 s
      // naprej brez novega sporočila (vodji se je posnetek zataknil).
      const rem = ssRemoteRef.current;
      if (rem) {
        const v = rem.view;
        // + zakasnitev sledilcev (Nastavitve Jama), da sledilec ne zaostaja za zamikom sporočil.
        const lead = readFollowerLead();
        const rowPos = v.row < 0 ? -1 : v.row + Math.min(1, v.p + (v.playing ? v.rate * (Math.min(3, (now - rem.at) / 1000) + lead) : 0));
        if (v.hl !== hl) {
          hl = v.hl;
          setSsHlLine(v.hl);
        }
        ease(rowTarget(rowPos), dt);
        raf = requestAnimationFrame(tick);
        return;
      }
      const clock = ssClockRef.current;
      // Interpoliran čas; največ 0,6 s naprej brez nove osvežitve (zastoj).
      let t = clock.playing ? clock.t + Math.min(0.6, ((now - clock.at) / 1000) * clock.rate) : clock.t;
      // Nova osvežitev je lahko malo za ocenjenim — ne nazaj za drobce
      // (tresenje); večji skok nazaj (previjanje) velja takoj.
      if (clock.playing && t < shownT && shownT - t < 0.3) t = shownT;
      shownT = t;
      const { points, offset } = ssSyncRef.current;
      let line = -1;
      let progress = 0;
      let span = 0;
      let gap = false;
      let gapInfo: ReturnType<typeof instrumentalGapAt> = null;
      const lt = t - offset;
      if (points) {
        ({ lineIndex: line, progress, span } = lineProgressAt(points, lt));
        // Instrumentalni del: zapeta vrstica končana, naslednja ≥ SS_GAP_MIN s.
        gapInfo = instrumentalGapAt(points, lt, SS_GAP_MIN);
        gap = !!gapInfo;
      }
      const want = gap ? -1 : line;
      if (want !== hl) {
        hl = want;
        setSsHlLine(want);
      }
      let k = rowFor(line);
      let rowPos = k >= 0 ? k + progress : -1;
      // Solo/vmesni del čez več vrstic akordov: od polovice premora pogled počasi
      // drsi proti vrstici za njim, da je ob koncu sola že vidna (Bad Moon Rising).
      let rate = clock.playing && k >= 0 && span > 0 ? 1 / span : 0;
      if (gapInfo && gapInfo.nextLine >= 0 && k >= 0) {
        const from = k + 1;
        const to = rowFor(gapInfo.nextLine);
        if (to > from) {
          const q = Math.min(1, Math.max(0, (gapInfo.progress - 0.5) / 0.5));
          rowPos = from + (to - from) * q;
          k = Math.floor(rowPos);
          rate = clock.playing && q > 0 && q < 1 ? (to - from) / (gapInfo.length / 2) : 0;
        }
      }
      // Intro (pred prvo zapeto vrstico): pogled enakomerno drsi čez vrstice
      // intra in pride na prvo zapeto vrstico ravno, ko se začne petje — prej je
      // stal na vrhu in ob prvi vrstici skočil dol (My Sweet Lord).
      if (points?.length && line < 0) {
        const first = points[0];
        const to = rowFor(first.lineIndex);
        if (to > 0 && first.time > 0) {
          const q = Math.min(1, Math.max(0, lt / first.time));
          rowPos = to * q;
          k = Math.floor(rowPos);
          rate = clock.playing && q < 1 ? to / first.time : 0;
        }
      }
      if (smoothScroll && points?.length && tops.length) {
        const duration = ssDurationRef.current;
        if (!smooth || smooth.points !== points || smooth.duration !== duration) smooth = buildSmooth(points, duration);
        const y = smoothPos(lt);
        ease(y, dt);
        // Za sledilce: isti položaj kot delna vrstica + hitrost (vrstice/s).
        rowPos = rowAtPx(y);
        k = Math.floor(rowPos);
        rate = clock.playing ? Math.max(0, (rowAtPx(smoothPos(lt + 0.25)) - rowPos) / 0.25) : 0;
      } else ease(rowTarget(rowPos), dt);
      // Vodja v Skupnem Jamu: sporočilo ob novi vrstici, pavzi/predvajanju,
      // preskoku (napredek ni tam, kjer ga sledilec pričakuje) in 1× na sekundo.
      if (leaderReportRef.current) {
        const view: SamSpiliView = {
          row: k,
          p: Math.round((k >= 0 ? rowPos - k : progress) * 1000) / 1000,
          // Sledilec napreduje v pravem času — hitrost predvajanja je že vračunana.
          rate: Math.round(rate * clock.rate * 10000) / 10000,
          hl: want,
          playing: clock.playing,
        };
        const expected = sent ? Math.min(1, sent.p + sent.rate * ((now - sentAt) / 1000)) : 0;
        const changed =
          !sent || sent.row !== view.row || sent.hl !== view.hl || sent.playing !== view.playing || Math.abs(expected - view.p) > 0.03;
        if ((changed && now - sentAt >= 50) || now - sentAt >= 1000) {
          sent = view;
          sentAt = now;
          ssLastRef.current = view;
          reportView();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      box.removeEventListener("pointerdown", onTouchDown);
      window.removeEventListener("pointermove", onTouchMove);
      window.removeEventListener("pointerup", onTouchUp);
      window.removeEventListener("pointercancel", onTouchUp);
      box.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("click", onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssShowLines, ssLines, smoothScroll]);
  // Med predvajanjem "Sam Špili" se zaslon ne sme temniti/zakleniti (Screen
  // Wake Lock). Brskalnik ključavnico sprosti, ko je zavihek skrit, zato jo ob
  // vrnitvi (visibilitychange) zahtevamo znova. Brez podpore se ne zgodi nič.
  useEffect(() => {
    if (!ssShowLines || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch {}
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [ssShowLines]);
  // Ob zaprtju: izhod iz celozaslonskega načina in sprostitev ležeče usmeritve.
  useEffect(() => {
    if (!samSpili) return;
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
      } catch {}
    };
  }, [samSpili]);
  // Play: samo predvajanje. Celozaslonsko/ležeče se vklopi že ob kliku na
  // "Sam Špili" v meniju (enterLandscapeFullscreen) ali z gumbom ⛶ — ne tukaj,
  // ker requestFullscreen porabi dovoljenje klika in bi YouTube ostal ustavljen.
  // ▶ v predvajalniku ali play na samodejnem pomikanju (navadni pogled): skladba,
  // celozaslonsko in samodejno pomikanje v istem kliku. Brskalniški celozaslonski
  // način samo, če predvajalnik že obstaja (tudi na računalniku) — ob prvem zagonu bi
  // requestFullscreen porabil dovoljenje klika in YouTube bi ostal ustavljen (ista
  // past kot pri Sam Špili: prvi ▶ ni igral, drugi je); takrat se skrijeta samo
  // vrstici aplikacije, brskalniški celozaslonski se vklopi ob naslednjem kliku.
  const autoScrollCtlRef = useRef<{ play: () => void; changeSpeed: (delta: number) => number } | null>(null);
  const startPlayView = (from: "player" | "autoscroll" | "smart") => {
    if (samSpili || recorder || follower) return;
    const playerExists = playerCtlRef.current?.currentTime() != null;
    closeThemeMenu();
    setIsFullscreen(true);
    if (playerExists && canBrowserFullscreen() && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (from === "player" && !smartActive) autoScrollCtlRef.current?.play();
    if (from === "autoscroll") playerCtlRef.current?.play();
  };
  // Tipkovnica (akordi v aplikaciji in Sam Špili): ↑ / ↓ = glasnost po 5 % (ne za
  // sledilca — ta nima svojega predvajanja; ne v urejevalniku in poljih).
  const ssVolumeKeysRef = useRef(ssChangeVolume);
  // Numerična tipkovnica + / −: velikost besedila (navadni pogled: pisava, Sam Špili: povečava).
  const fontKeysRef = useRef<(dir: 1 | -1) => void>(() => {});
  useEffect(() => {
    ssVolumeKeysRef.current = ssChangeVolume;
    fontKeysRef.current = (dir) => {
      if (samSpili) changeSsScale(dir * SS_SCALE_STEP);
      else setFontSize((f) => Math.min(MAX_FONT, Math.max(MIN_FONT, f + dir * FONT_STEP)));
    };
  });
  useEffect(() => {
    if (follower) return;
    const onKey = (e: KeyboardEvent) => {
      // Numerična 0 / 1: samodejno pomikanje počasneje / hitreje (navadni pogled).
      if ((e.code === "Numpad0" || e.code === "Numpad1") && !samSpili) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const ctl = autoScrollCtlRef.current;
        if (!ctl) return;
        e.preventDefault();
        showKeyMsg(`Hitrost pomikanja ${ctl.changeSpeed(e.code === "Numpad1" ? 1 : -1)}`);
        return;
      }
      if (e.code === "NumpadAdd" || e.code === "NumpadSubtract") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        fontKeysRef.current(e.code === "NumpadAdd" ? 1 : -1);
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      ssVolumeKeysRef.current(e.key === "ArrowUp" ? 5 : -5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [follower, samSpili]);
  const ssPlay = () => {
    setSmartOn(true);
    setSsActive(true);
    setSsRequested(true);
    playerCtlRef.current?.play();
  };
  // Če se predvajanje ne začne (brskalnik ga je blokiral), gumb po 6 s spet
  // deluje — drugi dotik kliče playVideo neposredno in zažene.
  useEffect(() => {
    if (!ssRequested) return;
    const t = setTimeout(() => setSsRequested(false), 6000);
    return () => clearTimeout(t);
  }, [ssRequested]);
  const [ssIsFullscreen, setSsIsFullscreen] = useState(() => typeof document !== "undefined" && (!!document.fullscreenElement || isAppFullscreen()));
  // Sledilec (Skupni Jam, tudi gost): celozaslonsko — na telefonu ležeče.
  // Brskalnik zahteva dotik na tej napravi, zato ga sproži prvi dotik v Sam
  // špili, gumb na čakalnem zaslonu ali poziv, ko vodja začne igrati.
  const ssFollowerFullscreen = () => {
    setSsFsPromptDismissed(true);
    if (document.fullscreenElement || !canBrowserFullscreen()) return;
    if (window.matchMedia("(pointer: coarse)").matches) enterLandscapeFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const [ssFsPromptDismissed, setSsFsPromptDismissed] = useState(false);
  useEffect(() => {
    if (!samSpili) return;
    const onChange = () => setSsIsFullscreen(!!document.fullscreenElement || isAppFullscreen());
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [samSpili]);
  const ssPause = () => {
    setSsRequested(false);
    setSsActive(false);
    playerCtlRef.current?.pause();
  };

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
  // Računalnik: preslednica = TAP, Backspace = razveljavi zadnji tap,
  // Shift+Backspace / Ctrl+Y / Ctrl+Shift+Z = ponovi.
  const recordTapRef = useRef(recordTap);
  const undoTapRef = useRef(undoTap);
  const redoTapRef = useRef(redoTap);
  useEffect(() => {
    recordTapRef.current = recordTap;
    undoTapRef.current = undoTap;
    redoTapRef.current = redoTap;
  });
  const recording = !!recorder;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      // Preslednica je med snemanjem vedno TAP ob PRITISKU tipke — tudi ko ima
      // kakšen gumb fokus (ta bi jo sicer sprožil šele ob spustu, prepozno).
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) recordTapRef.current();
      } else if ((e.key === "Backspace" && e.shiftKey) || ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z")))) {
        e.preventDefault();
        redoTapRef.current();
      } else if (e.key === "Backspace" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        undoTapRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording]);
  // Računalnik: puščici ← / → = skladba 5 s nazaj / naprej (tudi v Sam Špili in
  // med snemanjem). Ne med pisanjem v polje; drsnik (range) bi sicer sam
  // premaknil za 1 s — preventDefault. Sledilec v Skupnem Jamu nima svojega
  // predvajanja; brez zagnanega predvajalnika seekBy ne naredi nič.
  useEffect(() => {
    if (follower) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if ((e.target as HTMLElement).closest?.('input:not([type="range"]),textarea,[contenteditable="true"]')) return;
      e.preventDefault();
      playerCtlRef.current?.seekBy(e.key === "ArrowLeft" ? -5 : 5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [follower]);

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
      const own = descShapes.get(name);
      const positions = mergeShapes(own, findChordShapes(db, name));
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
  // Izbira različice za akord (okno ob akordu in "Pokaži akorde" si jo delita).
  const stepShapeOf = (name: string, count: number, delta: number) =>
    setShapeChoice((prev) => {
      const cur = Math.min(prev[name] ?? 0, count - 1);
      return { ...prev, [name]: (cur + delta + count) % count };
    });
  const stepShape = (delta: number) => {
    if (shapeTip) stepShapeOf(shapeTip.name, shapeTip.positions.length, delta);
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
  // Akord v vrstici Z BESEDILOM (kitica, refren, zapeti interlude) je ob svojem
  // času samo podčrtan, pobarvan ostane samo v vrsticah brez besedila (intro,
  // solo, outro) — za skladbe z natapkanimi akordi petja (skill podcrtaj-akorde).
  const underlineSung = !!syncedChords?.sungUnderline;
  // Vrstice z besedilom (za podčrtavanje akordov v zapetih delih).
  const lyricLineSet = useMemo(
    () =>
      new Set(
        body.flatMap((l, i) =>
          (l.kind === "pair" && l.chunks.some((c) => c.lyric.trim())) ||
          (l.kind === "text" && l.segments.some((x) => "text" in x && x.text.trim()))
            ? [i]
            : [],
        ),
      ),
    [body],
  );
  const chordName = (name: string, at?: { line: number; chord: number }) => {
    const key = at ? `${at.line}:${at.chord}` : null;
    // activeChord: med Smart playem iz shranjenih delov, med snemanjem iz osnutka.
    const activeAny =
      !!at &&
      ((shownChord?.line === at.line && shownChord.chord === at.chord) ||
        (!follower && !!activeChord && ` ${activeChordsAlso} `.includes(` ${at.line}:${at.chord} `)));
    // Test (UNDERLINE_TEST_TITLES): v vrstici z besedilom samo podčrtaj.
    const underlined = activeAny && underlineSung && lyricLineSet.has(at.line);
    const active = activeAny && !underlined;
    const recorded = !!recorder && !!key && recordedChords.has(key);
    return (
      <span
        data-chord-name
        className={`cursor-pointer ${
          // Senca namesto odmika: obarvano ozadje brez premika postavitve;
          // px + enak negativni mx = malo prostora levo/desno znotraj obrobe,
          // postavitev se ne premakne.
          active ? "-mx-[0.2em] px-[0.2em] rounded-(--cv-mark-radius) bg-(--cv-mark-bg) text-(--cv-mark-text) shadow-[0_0_0_var(--cv-mark-width)_var(--cv-mark-border)]" : ""
        } ${recorded && !activeAny ? "underline decoration-orange-400 decoration-dotted underline-offset-4" : ""}`}
        style={
          underlined
            ? // Spodnja črta, ki sega malo čez ime (podčrtaj tega ne zmore); −margin = padding, nič se ne premakne.
              { marginInline: "-0.2em", paddingInline: "0.2em", boxShadow: "inset 0 calc(-1 * max(2px, var(--cv-mark-width))) 0 var(--cv-mark-border)" }
            : undefined
        }
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && !recorder) showShape(name, e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleHide();
        }}
        // Snemanje: čas ob PRITISKU (onClick pride šele ob spustu, 0,1–0,2 s
        // prepozno); klik s tipkovnico (detail 0) še vedno prek onClick.
        onPointerDown={(e) => {
          if (!recorder || !at || e.button !== 0) return;
          e.preventDefault();
          recordChord(at.line, at.chord);
        }}
        onClick={(e) => {
          if (recorder) {
            if (at && e.detail === 0) recordChord(at.line, at.chord);
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
        // Skrita tablatura: samo zaporedje akordov, za vsakim enak razmik
        // (3 presledki, tudi za daljšimi imeni), brez vodoravnega pomika.
        return (
          <div key={i}>
            {orphanButton}
            <div className="flex flex-wrap font-bold text-(--cv-chord)">
              {line.header.map((c, j) => {
                const name = display(c.name);
                return (
                  <span key={j} className="whitespace-pre" style={{ minWidth: `${name.length + 3}ch` }}>
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
  // Orodna vrstica: vsi gumbi visoki 26 px (kot Sam Špili / Ultimate Guitar) — v skupinah z robom in p-0.5 notranji 20 px.
  const toolbarTone = toneButton.replace("h-7 min-w-7", "h-5 min-w-5");

  // Oznake delov na drsniku "Prevrtavanje": napis v vrsti nad drsnikom, pri gneči
  // pod njim, sicer samo črtica (row −1). ~5,2 px na znak pri 9 px pisavi.
  const ssMarkerItems: { t: number; label: string; short: string; left: number; row: number }[] = [];
  if (videoDuration > 0 && ssTrackW > 0) {
    const lastEnd = [-Infinity, -Infinity];
    for (const m of sectionMarkers) {
      if (m.t >= videoDuration) continue;
      const x = (m.t / videoDuration) * ssTrackW;
      const short = m.label.replace(/^Interlude/i, "Inter.").replace(/^Pre-?Chorus/i, "Pre-Ch.").replace(/^Instrumental/i, "Instr.");
      const row = x >= lastEnd[0] ? 0 : x >= lastEnd[1] ? 1 : -1;
      if (row >= 0) lastEnd[row] = x + short.length * 5.2 + 6;
      ssMarkerItems.push({ ...m, short, left: (m.t / videoDuration) * 100, row });
    }
  }
  const ssSeekToTime = (t: number) => {
    setSsTime(t);
    if (playerCtlRef.current?.seekAndPlay(t)) setSsActive(true);
  };

  return createPortal(
    <div data-view-portal onClick={(e) => e.stopPropagation()} style={rootStyle} className="fixed inset-0 z-50 isolate flex flex-col overflow-hidden bg-(--cv-bg) pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      {theme.pattern && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <PatternSvg id={theme.pattern} colors={patternColors} className="h-full w-full" />
        </div>
      )}

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
          className="fixed right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 bg-neutral-900/70 text-amber-400 backdrop-blur active:scale-95"
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
          style={{ top: themeMenuPos.top, bottom: themeMenuPos.bottom, left: themeMenuPos.left, maxHeight: themeMenuPos.maxHeight }}
          className={`fixed w-72 space-y-3 overflow-y-auto rounded-xl border border-orange-400 dark:border-white/10 dark:glass-menu dark:rounded-2xl bg-neutral-900 p-3 font-sans shadow-xl ${samSpili ? "ss-phone-menu z-50" : "z-10"}`}
        >
          {/* "Sam Špili": naslov, razpirajoča "Tema", napredne na dnu. */}
          {samSpili ? (
            <>
              <p className="px-1 text-[13px] font-medium text-neutral-400">Nastavitve</p>
              <div className="border-t border-neutral-700 px-1 pt-2">
                {pickerHeader("Tema", ssSettingsThemeOpen, () => setSsSettingsThemeOpen((v) => !v))}
                {ssSettingsThemeOpen && <div className="mt-3 space-y-3 pl-2">{themePickers}</div>}
              </div>
            </>
          ) : (
            // Vse nastavitve tem in barv v enem razprtem razdelku (telefon in računalnik).
            <div className="border-t border-neutral-700 px-1 pt-2">
              {pickerHeader("Tema", ssSettingsThemeOpen, () => setSsSettingsThemeOpen((v) => !v))}
              {ssSettingsThemeOpen && <div className="mt-3 space-y-3 pl-2">{themePickers}</div>}
            </div>
          )}
          {/* Pametni predvajalnik: v glavnih nastavitvah (ne v naprednih). Računalnik:
              skrit v navadnem pogledu — zamika in Posnemi čase so v orodni vrstici. */}
          <div className={`border-t border-neutral-700 px-1 pt-2 ${samSpili ? "" : "lg:hidden"}`}>
            <button
              type="button"
              onClick={() => setSmartInfoOpen((v) => !v)}
              aria-expanded={smartInfoOpen}
              className="flex w-full items-center justify-between text-left text-[13px] text-neutral-200 hover:text-white"
            >
              Pametni predvajalnik
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-amber-400 transition ${smartInfoOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {smartInfoOpen && (
            <div className="mt-1">
            {chordPoints.length > 0 && (
              <span className="block text-[10px] leading-tight text-neutral-500">
                Instrumentalni deli: {syncedChords?.sections.map((s) => s.name).join(", ")} (
                {chordPoints.filter((p) => !("stop" in p)).length} akordov)
              </span>
            )}
            {chordsWrongVideo && (
              <span className="block text-[10px] leading-tight text-amber-400">
                Časi akordov so posneti za drug posnetek — oznake akordov se ne kažejo. Izberi tisti posnetek v seznamu posnetkov.
              </span>
            )}
            <span className="block text-[10px] leading-tight text-neutral-500">
              {sync?.manual
                ? syncedLines?.frozen
                  ? `Zamrznjeni časi: ${sync.points.length} vrstic (neodvisno od LRCLIB).`
                  : `Ročno posneti časi: ${sync.points.length} tapov. Zaženi z gumbom Smart play levo od ▶.`
                : lrcError
                ? `Napaka: ${lrcError}`
                : !lrcCandidates
                  ? "Iščem besedilo s časi …"
                  : !sync
                    ? "Za to skladbo ni besedila s časi."
                    : `${lrc?.album || "Besedilo"}: povezanih ${sync.matched}/${sync.total} vrstic. Zaženi z gumbom Smart play levo od ▶.`}
            </span>
            {smartAvailable && (
              <div className={`mt-1.5 flex items-center justify-between gap-2 ${samSpili ? "" : "lg:hidden"}`}>
                <span className="text-[11px] text-neutral-300">
                  Zamik besedila
                  <span className="block text-[10px] leading-tight text-neutral-500">
                    {offsetLocked
                      ? "zaklenjeno — preverjena skladba (spremeniš ga prek Popravi skladbe)"
                      : playingVideo
                        ? "za posnetek, ki igra"
                        : "za posnetek, ki zaigra ob ▶"}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeLrcOffset(-LRC_OFFSET_STEP)}
                    disabled={!offsetVideo || offsetLocked}
                    className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                  >
                    −0,25 s
                  </button>
                  <OffsetValue
                    value={lrcOffset}
                    disabled={!offsetVideo || offsetLocked}
                    onSet={setLrcOffset}
                    className="w-14 text-center text-[11px] tabular-nums text-neutral-300"
                  />
                  <button
                    type="button"
                    onClick={() => changeLrcOffset(LRC_OFFSET_STEP)}
                    disabled={!offsetVideo || offsetLocked}
                    className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                  >
                    +0,25 s
                  </button>
                </div>
              </div>
            )}
            {underlineSung && syncedChords && (
              <div className={`mt-1.5 flex items-center justify-between gap-2 ${samSpili ? "" : "lg:hidden"}`}>
                <span className="text-[11px] text-neutral-300">
                  Zamik akordov
                  <span className="block text-[10px] leading-tight text-neutral-500">
                    {offsetLocked ? "zaklenjeno — preverjena skladba" : "podčrtani akordi v zapetih vrsticah"}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changeSungOffset(-LRC_OFFSET_STEP)}
                    disabled={offsetLocked}
                    className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                  >
                    −0,25 s
                  </button>
                  <OffsetValue
                    value={sungOffset}
                    disabled={offsetLocked}
                    onSet={setSungOffset}
                    className="w-14 text-center text-[11px] tabular-nums text-neutral-300"
                  />
                  <button
                    type="button"
                    onClick={() => changeSungOffset(LRC_OFFSET_STEP)}
                    disabled={offsetLocked}
                    className="rounded-full border border-orange-400 px-2 text-xs text-amber-400 disabled:opacity-40"
                  >
                    +0,25 s
                  </button>
                </div>
              </div>
            )}
            {!samSpili && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* Na računalniku je ta gumb v orodni vrstici. */}
                <button
                  type="button"
                  onClick={recorder ? cancelRecorder : startRecorder}
                  className="rounded-full border border-orange-400 px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:bg-orange-400/15 lg:hidden"
                >
                  {recorder ? "Prekliči snemanje" : syncedLines || syncedChords ? "Nadaljuj snemanje časov" : "Posnemi čase"}
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
            {verifyMsg && <span className="mt-1 block text-[10px] leading-tight text-red-400">{verifyMsg}</span>}
            {smartAvailable && lrcOffsetError && (
              <span className="mt-1 block text-[10px] leading-tight text-red-400">
                Zamik je shranjen samo v tem brskalniku ({lrcOffsetError}). Poženi migracijo 0028_add_lrc_offset.sql v Supabase.
              </span>
            )}
            </div>
            )}
          </div>
          <div className="border-t border-neutral-700 pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left text-[13px] font-medium text-neutral-200 hover:text-white"
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
            {advancedOpen && (
              <div className="space-y-2 px-1 pt-2">
                {underlineSung ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-200">
                      Podčrtani akordi
                      <span className="block text-[10px] leading-tight text-neutral-500">Označevanje akordov v zapetih vrsticah</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sungChordsOn}
                      aria-label="Podčrtani akordi"
                      onClick={() => setSungChordsOn((v) => !v)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${sungChordsOn ? "bg-orange-400" : "bg-neutral-600"}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sungChordsOn ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                ) : null}
                {/* Skok pred del ob kliku na oznako na drsniku. */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-200">
                    Skok pred klikom na del besedila
                    <span className="block text-[10px] leading-tight text-neutral-500">Klik na oznako na drsniku (Refren 2 …) začne toliko prej</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMarkerLead((v) => Math.max(0, v - 1))}
                      disabled={markerLead <= 0}
                      aria-label="Manj sekund pred delom"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-400 text-sm text-amber-400 hover:bg-orange-400/15 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-xs tabular-nums text-neutral-200">{markerLead} s</span>
                    <button
                      type="button"
                      onClick={() => setMarkerLead((v) => Math.min(15, v + 1))}
                      disabled={markerLead >= 15}
                      aria-label="Več sekund pred delom"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-400 text-sm text-amber-400 hover:bg-orange-400/15 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
                {/* Računalnik, samo ob odprtem Impro: velikost orodne vrstice (null = samodejno). */}
                {improOpen && (
                <div className="hidden items-center justify-between gap-2 lg:flex">
                  <span className="text-xs text-neutral-200">
                    Velikost orodne vrstice (Impro)
                    <button
                      type="button"
                      onClick={() => setToolbarScale(null)}
                      disabled={toolbarScale === null}
                      className="block text-[10px] leading-tight text-neutral-500 enabled:text-amber-400 enabled:hover:underline"
                    >
                      {toolbarScale === null ? "Samodejno" : "Ponastavi na samodejno"}
                    </button>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => stepToolbarScale(-1)}
                      disabled={toolbarScale !== null && toolbarScale <= TOOLBAR_SCALE_MIN}
                      aria-label="Manjša orodna vrstica"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-400 text-sm text-amber-400 hover:bg-orange-400/15 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-xs tabular-nums text-neutral-200">
                      {toolbarScale === null ? "auto" : `${Math.round(toolbarScale * 100)} %`}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepToolbarScale(1)}
                      disabled={toolbarScale !== null && toolbarScale >= TOOLBAR_SCALE_MAX}
                      aria-label="Večja orodna vrstica"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-400 text-sm text-amber-400 hover:bg-orange-400/15 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
                )}
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

      {/* Besedilo in (računalnik) snemalnik časov kot stolpec desno. */}
      <div className={`flex min-h-0 flex-1 flex-col lg:flex-row ${editing ? "hidden" : ""}`}>
        <div ref={scrollRef} className={`min-h-0 flex-1 overflow-auto px-4 pb-32 [scrollbar-width:none] lg:px-16 [&::-webkit-scrollbar]:hidden ${editing ? "hidden" : ""}`}>
      {/* Zgornji vrstici sta prvi del pomičnega besedila (lepljivi): ob drsenju
          navzdol ju besedilo naravno odrine gor, ob drsenju navzgor se pokažeta
          od zgoraj (glej efekt barsOuterRef). Med samodejnim pomikanjem in v
          celozaslonskem načinu se zložita (CSS, ne odstranjeno — predvajalnik
          mora ostati, da glasba igra naprej). */}
      <div
        ref={barsOuterRef}
        className="sticky z-20 -mx-4 grid lg:-mx-16"
        style={{
          top: 0,
          gridTemplateRows: barsHidden ? "0fr" : "1fr",
          transition: `grid-template-rows ${BARS_TRANSITION}`,
        }}
        aria-hidden={barsHidden}
      >
      <div
        ref={barsItemRef}
        className="relative isolate min-h-0 overflow-hidden"
        // Brez transform: ta bi fixed sličico YouTube videa (znotraj vrstice) ujel v ta okvir.
        style={{ opacity: barsHidden ? 0 : 1, transition: `opacity ${BARS_TRANSITION}` }}
      >
      {/* Telefon: steklena podlaga obeh vrstic — zameglitev je na tem ločenem sloju,
          ne na vrsticah (backdrop-filter bi kot transform ujel fixed sličico videa). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-neutral-900/55 backdrop-blur-xl backdrop-saturate-150 lg:hidden" />
      <div className="flex shrink-0 items-center justify-between gap-3 bg-neutral-900 px-4 py-2 max-lg:bg-transparent lg:px-12 lg:[zoom:1.35]">
        {/* Tudi brez kandidatov: v izbirniku posnetka lahko prilepiš povezavo. */}
        <YouTubeMiniPlayer
            videoIds={offsetLocked && lockedVideo ? [lockedVideo] : videoIds}
            lockedNote={
              offsetLocked && lockedVideo
                ? "Skladba je preverjena — posnetek je zaklenjen. Drugega izbereš, ko jo prijaviš v Popravi skladbe."
                : undefined
            }
            watchUrl={
              watchUrl ??
              (videoIds[0]
                ? `https://www.youtube.com/watch?v=${videoIds[0]}`
                : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.author} ${song.title}`)}`)
            }
            sliderHost={sliderHostEl}
            sliderBelow={improOpen}
            sectionMarkers={sectionMarkers}
            markerLead={markerLead}
            onMarkerClick={(m) => scrollToSection(m.line)}
            onTime={onVideoTime}
            smartAvailable={smartAvailable}
            smartOn={smartOn}
            onSmartToggle={setSmartOn}
            onUserPlay={() => startPlayView("player")}
            onSmartPlay={() => startPlayView("smart")}
            preload={preloadPlayer && !follower}
            playMenu={!samSpili && !follower}
            controllerRef={playerCtlRef}
            playbackRate={playbackRate}
            preferredId={preferredVideo}
            onSelect={async (id) => {
              // Preverjen predvajalnik je vezan na svoj posnetek: drug posnetek ga razveljavi.
              const unlock = !!lockedVideo && id !== lockedVideo;
              if (unlock && !window.confirm("Ta skladba ima preverjen predvajalnik za drug posnetek. Izbira tega posnetka razveljavi preverjanje. Nadaljujem?")) {
                return "Izbira preklicana — preverjen posnetek ostane.";
              }
              const prev = preferredVideo;
              setPreferredVideo(id);
              const { error } = await supabase
                .from("songs")
                .update({ preferred_video_id: id, ...(unlock ? { verified_player_at: null } : {}) })
                .eq("id", song.id);
              if (error) setPreferredVideo(prev);
              else if (unlock) setVerifiedPlayerAt(null);
              return error ? error.message : null;
            }}
            onPlaying={(id) => {
              setPlayingVideo(id);
              try {
                window.localStorage.setItem(workingVideoKey(song.id), id);
              } catch {}
            }}
          />
        {toolbarCollapsed && (
          <button
            type="button"
            onClick={() => setToolbarCollapsed(false)}
            aria-label="Pokaži orodno vrstico"
            title="Pokaži orodno vrstico"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-amber-400 transition hover:bg-orange-400/15 active:scale-95"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
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

      {/* Telefon (in računalnik ob odprtem Impro): drsnik po skladbi čez celo širino, med zgornjo vrstico in orodji. */}
      <div
        ref={setSliderHost}
        className={`flex shrink-0 items-center px-4 pb-2 empty:hidden ${
          improOpen ? "lg:bg-neutral-900 lg:px-12 lg:pb-2.5 lg:pt-4 lg:[zoom:1.35]" : "lg:hidden"
        }`}
      />

      {/* Računalnik: orodna vrstica se poveča toliko, da je v eni vrsti do desnega
          roba (fitToolbar, največ 135 %); telefon: navaden tok gumbov. */}
      <div
        ref={toolbarRef}
        data-impro={improOpen ? "" : undefined}
        data-scale={improOpen ? (toolbarScale ?? undefined) : undefined}
        className={`${toolbarCollapsed ? "hidden" : "flex"} shrink-0 flex-wrap items-center justify-start gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5 max-lg:border-white/10 max-lg:bg-transparent lg:items-end lg:gap-3 lg:px-12 xl:px-8`}>
        {/* Računalnik: skupine z napisom (Povezave, Prilagajanje, Urejanje, Funkcije,
            Nastavitve); telefon: "contents" + max-lg:order — en tok gumbov kot prej. */}
        {((hasSamSpili(song) && !recorder && !follower) || (!!song.chords_source_url && /ultimate-guitar.com/.test(song.chords_source_url))) && (
            <div className="contents lg:flex lg:flex-col lg:gap-1">
              <span className="hidden px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-orange-400 lg:block">Povezave</span>
              <div className="contents lg:flex lg:items-center lg:gap-2">
                {/* Neposredno v Sam Špili (iste skladbe kot v meniju Akordi, ne med snemanjem
                    in ne za sledilca). Celozaslonsko + ležeče v istem kliku, kot iz menija. */}
                {hasSamSpili(song) && !recorder && !follower && (
                  <button
                    type="button"
                    onClick={() => {
                      closeThemeMenu();
                      enterLandscapeFullscreen();
                      openChordsViewer(song.id, "samspili");
                    }}
                    title="Sam Špili"
                    aria-label="Sam Špili"
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 text-neutral-200 transition hover:text-white active:scale-95 dark:border-white/15 max-lg:order-1"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-orange-400">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M10 8.5v7l5.5-3.5z" />
                    </svg>
                  </button>
                )}
                {/* Računalnik: povezava na Ultimate Guitar (skupina Povezave). */}
                {song.chords_source_url && /ultimate-guitar.com/.test(song.chords_source_url) && (
                  <a
                    href={song.chords_source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Odpri na Ultimate Guitar"
                    aria-label="Odpri na Ultimate Guitar"
                    className="hidden h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 text-neutral-200 transition hover:text-white active:scale-95 dark:border-white/15 lg:flex"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-orange-500">
                      <path d="M18.1 6.9A8 8 0 1 0 20 12h-7" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
        )}
        <div className="contents lg:flex lg:flex-col lg:gap-1 lg:border-l lg:border-white/15 lg:pl-3 xl:pl-2 2xl:pl-3">
          <span className="hidden px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-orange-400 lg:block">Prilagajanje</span>
          <div className="contents lg:flex lg:items-center lg:gap-2">
            <div
              className="flex items-center rounded-full border border-orange-400 dark:border-white/15 py-0.5 pl-2.5 pr-0.5 max-lg:order-2"
              role="group"
              aria-label="Transpozicija"
            >
              <button
                type="button"
                onClick={() => setToneOpen((v) => !v)}
                aria-expanded={toneOpen}
                title="Transpozicija"
                className={`mr-0.5 flex h-5 items-center gap-1 text-xs ${toneOpen ? "text-neutral-400" : "pr-2 text-neutral-200 hover:text-white"}`}
              >
                {/* Ena nota: transpozicija. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="-ml-1 h-3.5 w-3.5 shrink-0 text-amber-400">
                  <circle cx="8" cy="18" r="3" fill="currentColor" />
                  <path d="M11 18V4l7 3" />
                </svg>
                Ton
                {!toneOpen && semitones !== 0 && <span className="ml-0.5 tabular-nums text-amber-400">{semitones > 0 ? `+${semitones}` : semitones}</span>}
              </button>
              {toneOpen && (
              <>
              <button type="button" onClick={() => shift(-1)} aria-label="Pol tona nižje" title="Pol tona nižje" className={toolbarTone}>
                −
              </button>
              <button
                type="button"
                onClick={() => setSemitones(0)}
                title="Izvirna tonaliteta"
                className={`${toolbarTone} w-7 tabular-nums ${semitones !== 0 ? "text-amber-400" : ""}`}
              >
                {semitones > 0 ? `+${semitones}` : semitones}
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Pol tona višje" title="Pol tona višje" className={toolbarTone}>
                +
              </button>
              </>
              )}
            </div>
            <div className="flex items-center rounded-full border border-orange-400 dark:border-white/15 p-0.5 max-lg:order-6" role="group" aria-label="Velikost pisave">
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.max(MIN_FONT, f - FONT_STEP))}
                disabled={fontSize <= MIN_FONT}
                aria-label="Manjša pisava"
                title="Manjša pisava"
                className={`${toolbarTone} px-1.5 text-xs`}
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.min(MAX_FONT, f + FONT_STEP))}
                disabled={fontSize >= MAX_FONT}
                aria-label="Večja pisava"
                title="Večja pisava"
                className={`${toolbarTone} px-1.5 text-base`}
              >
                A+
              </button>
            </div>
            <button
              type="button"
              onClick={enterFullscreen}
              aria-label="Celozaslonski način"
              title="Celozaslonski način"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-neutral-200 transition hover:text-white active:scale-95 max-lg:order-13"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-1 lg:border-l lg:border-white/15 lg:pl-3 xl:pl-2 2xl:pl-3">
          <span className="hidden px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-orange-400 lg:block">Urejanje</span>
          <div className="contents lg:flex lg:items-center lg:gap-2">
            {/* Računalnik: napredni urejevalnik besedila (isti kot na straneh Pregled
                in odobritev / Popravi skladbe). */}
            {onOpenEditor && (
              <button
                type="button"
                onClick={onOpenEditor}
                disabled={!!recorder}
                title="Urejevalnik — napredni urejevalnik besedila z akordi in tablatur"
                aria-label="Urejevalnik"
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-xs text-neutral-200 transition hover:text-white disabled:opacity-40 active:scale-95 max-lg:order-9"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-400">
                  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                </svg>
              </button>
            )}
            {/* Računalnik: "Posnemi čase" v vrstici (na telefonu v ⚙ → Napredne nastavitve). */}
            <button
              type="button"
              onClick={recorder ? cancelRecorder : startRecorder}
              aria-pressed={!!recorder}
              title={recorder ? "Prekliči snemanje časov" : syncedLines || syncedChords ? "Nadaljuj snemanje časov vrstic in akordov" : "Posnemi čase vrstic in akordov za Smart play"}
              aria-label={recorder ? "Prekliči snemanje" : syncedLines || syncedChords ? "Nadaljuj snemanje" : "Posnemi čase"}
              className={`hidden h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-xs transition active:scale-95 max-lg:order-10 lg:flex ${
                recorder ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
              }`}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-500" />
            </button>
            {/* Računalnik: zamik Smart playa v vrstici (na telefonu v ⚙ → Napredne nastavitve). */}
            {smartAvailable && (
              <div
                className="hidden items-center rounded-full border border-orange-400 dark:border-white/15 py-0.5 pl-2.5 pr-0.5 max-lg:order-7 lg:flex"
                role="group"
                aria-label="Zamik besedila"
                title={playingVideo ? "Zamik besedila za posnetek, ki igra" : "Zamik besedila za posnetek, ki zaigra ob ▶"}
              >
                <button
                  type="button"
                  onClick={() => setOffsetOpen((v) => !v)}
                  aria-expanded={offsetOpen}
                  title={offsetLocked ? "Zamik je zaklenjen — skladba je preverjena (spremeniš ga prek Popravi skladbe)" : undefined}
                  className={`mr-0.5 flex h-5 items-center gap-1 text-xs ${offsetOpen ? "text-neutral-400" : "pr-2 text-neutral-200 hover:text-white"}`}
                >
                  {/* Štoparica: časovni zamik besedila glede na posnetek. */}
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="-ml-1 h-3.5 w-3.5 text-amber-400">
                    <path d="M10 2h4" />
                    <path d="m12 14 3-3" />
                    <circle cx="12" cy="14" r="8" />
                  </svg>
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
                    <button type="button" onClick={() => changeLrcOffset(-LRC_OFFSET_STEP)} disabled={!offsetVideo || offsetLocked} aria-label="Besedilo 0,25 s prej" title="Besedilo 0,25 s prej" className={toolbarTone}>
                      −
                    </button>
                    <OffsetValue
                      value={lrcOffset}
                      disabled={!offsetVideo || offsetLocked}
                      onSet={setLrcOffset}
                      className="w-12 text-center text-xs tabular-nums text-neutral-200"
                    />
                    <button type="button" onClick={() => changeLrcOffset(LRC_OFFSET_STEP)} disabled={!offsetVideo || offsetLocked} aria-label="Besedilo 0,25 s pozneje" title="Besedilo 0,25 s pozneje" className={toolbarTone}>
                      +
                    </button>
                  </>
                )}
              </div>
            )}
            {/* Računalnik: zamik podčrtanih akordov (na telefonu v ⚙ → Pametni predvajalnik). */}
            {underlineSung && syncedChords && (
              <div
                className="hidden items-center rounded-full border border-orange-400 dark:border-white/15 py-0.5 pl-2.5 pr-0.5 max-lg:order-8 lg:flex"
                role="group"
                aria-label="Zamik akordov"
                title="Zamik podčrtanih akordov v zapetih vrsticah (intro in solo ostaneta)"
              >
                <button
                  type="button"
                  onClick={() => setSungOffsetOpen((v) => !v)}
                  aria-expanded={sungOffsetOpen}
                  title={offsetLocked ? "Zamik je zaklenjen — skladba je preverjena (spremeniš ga prek Popravi skladbe)" : undefined}
                  className={`mr-0.5 flex h-5 items-center whitespace-nowrap text-xs ${sungOffsetOpen ? "text-neutral-400" : "pr-2 text-neutral-200 hover:text-white"}`}
                >
                  Zamik akordov
                  {!sungOffsetOpen && sungOffset !== 0 && (
                    <span className="ml-1 tabular-nums text-amber-400">
                      {sungOffset > 0 ? "+" : ""}
                      {sungOffset.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </button>
                {sungOffsetOpen && (
                  <>
                    <button type="button" onClick={() => changeSungOffset(-LRC_OFFSET_STEP)} disabled={offsetLocked} aria-label="Akordi 0,25 s prej" title="Akordi 0,25 s prej" className={toolbarTone}>
                      −
                    </button>
                    <OffsetValue value={sungOffset} disabled={offsetLocked} onSet={setSungOffset} className="w-12 text-center text-xs tabular-nums text-neutral-200" />
                    <button type="button" onClick={() => changeSungOffset(LRC_OFFSET_STEP)} disabled={offsetLocked} aria-label="Akordi 0,25 s pozneje" title="Akordi 0,25 s pozneje" className={toolbarTone}>
                      +
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-1 lg:border-l lg:border-white/15 lg:pl-3 xl:pl-2 2xl:pl-3">
          <span className="hidden px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-orange-400 lg:block">Funkcije</span>
          <div className="contents lg:flex lg:items-center lg:gap-2">
            <button
              type="button"
              onClick={() => {
                setImproOpen((v) => !v);
                setQuizOpen(false);
              }}
              aria-pressed={improOpen}
              title="Lestvice za improvizacijo v tonaliteti skladbe"
              className={`flex h-[26px] items-center gap-1.5 max-lg:order-5 whitespace-nowrap rounded-full border border-orange-400 dark:border-white/15 px-2.5 text-xs font-medium transition active:scale-95 ${
                improOpen ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
              }`}
            >
              {/* Ista ikona kot v glavi odprtega Impro (vrat s toni, ImproPanel.tsx). */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                <path d="M3 6h18M3 10h18M3 14h18M3 18h18" />
                <circle cx="7" cy="8" r="1.4" fill="currentColor" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                <circle cx="17" cy="16" r="1.4" fill="currentColor" />
              </svg>
              Impro
            </button>
            <button
              type="button"
              onClick={() => setSimplify((v) => !v)}
              aria-pressed={simplify}
              title="Poenostavi akorde (D7 → D, Am7 → Am)"
              className={`flex h-[26px] items-center gap-1.5 max-lg:order-3 rounded-full border border-orange-400 dark:border-white/15 px-2.5 text-xs font-medium transition active:scale-95 ${
                simplify ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
              }`}
            >
              {/* Radirka: zbriše dodatke akordov (D7 → D, Am7 → Am, /bas). */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                <path d="M22 21H7" />
                <path d="m5 11 9 9" />
              </svg>
              Simplify
            </button>
            <button
              type="button"
              onClick={() => setShowShapes((v) => !v)}
              aria-pressed={showShapes}
              title="Pokaži prijeme vseh akordov skladbe"
              className={`flex h-[26px] items-center gap-1.5 max-lg:order-4 whitespace-nowrap rounded-full border border-orange-400 dark:border-white/15 px-2.5 text-xs font-medium transition active:scale-95 ${
                showShapes ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
              }`}
            >
              {/* Diagram prijema akorda. */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                <rect x="5" y="3" width="14" height="18" rx="1.5" />
                <path d="M5 8h14M5 13h14M10 3v18M14 3v18" />
                <circle cx="10" cy="10.5" r="1.3" fill="currentColor" />
                <circle cx="14" cy="15.5" r="1.3" fill="currentColor" />
              </svg>
              Pokaži akorde
            </button>
            {capo ? (
              <button
                type="button"
                onClick={() => setNoCapo((v) => !v)}
                aria-pressed={noCapo}
                title={`Akordi brez capa: prijemi s capom na ${capo}. prečki prestavljeni za ${capo} poltonov navzgor`}
                className={`flex h-[26px] items-center gap-1.5 max-lg:order-4 whitespace-nowrap rounded-full border border-orange-400 dark:border-white/15 px-2.5 text-xs font-medium transition active:scale-95 ${
                  noCapo ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
                }`}
              >
                {/* Strune s kapodastrom, prečrtano. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                  <path d="M8 3v18M12 3v18M16 3v18" />
                  <path d="M5 9h14" strokeWidth={3} />
                  <path d="m4 4 16 16" />
                </svg>
                No capo
              </button>
            ) : null}
            {!follower && (
              <button
                ref={rateButtonRef}
                type="button"
                onClick={toggleRateMenu}
                aria-expanded={rateMenuPos !== null}
                title="Hitrost predvajanja posnetka (počasneje za vadbo)"
                aria-label="Hitrost"
                // Telefon: samo ikona (krog kot ⚙); ob kliku (odprt meni) se razširi z napisom.
                className={`flex h-[26px] items-center max-lg:order-5 whitespace-nowrap rounded-full border border-orange-400 dark:border-white/15 text-xs font-medium transition-all duration-200 active:scale-95 lg:gap-1.5 lg:px-2.5 ${
                  rateMenuPos ? "gap-1.5 px-2.5" : "max-lg:w-[26px] max-lg:justify-center"
                } ${rateMenuPos || playbackRate !== 1 ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"}`}
              >
                {/* Merilnik hitrosti. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-amber-400">
                  <path d="M4 18a8 8 0 1 1 16 0" />
                  <path d="m12 18-3.5-5" />
                  <circle cx="12" cy="18" r="1.2" fill="currentColor" />
                </svg>
                <span className={rateMenuPos ? "" : "max-lg:hidden"}>Hitrost</span>
                {playbackRate !== 1 && (
                  <span className={`tabular-nums ${rateMenuPos ? "" : "max-lg:hidden"}`}>{String(playbackRate).replace(".", ",")}×</span>
                )}
              </button>
            )}
            {rateMenuPos && (
              <div
                data-rate-menu
                role="menu"
                aria-label="Hitrost predvajanja"
                style={{ top: rateMenuPos.top, left: rateMenuPos.left }}
                className="fixed z-50 flex w-32 flex-col overflow-hidden rounded-xl border border-orange-400/70 bg-neutral-900/95 py-1 text-sm shadow-xl backdrop-blur"
              >
                {PLAYBACK_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="menuitemradio"
                    aria-checked={playbackRate === r}
                    onClick={() => {
                      setPlaybackRate(r);
                      setRateMenuPos(null);
                    }}
                    className={`flex items-center justify-between px-3 py-1.5 text-left tabular-nums transition hover:bg-white/10 ${
                      playbackRate === r ? "text-amber-400" : "text-neutral-200"
                    }`}
                  >
                    {r === 1 ? "Normalno" : `${String(r).replace(".", ",")}×`}
                    {playbackRate === r && <span aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            )}
            <button
              ref={metroButtonRef}
              type="button"
              onClick={toggleMetroMenu}
              aria-expanded={metroMenuPos !== null}
              aria-label="Metronom"
              title={`Metronom (${metroBpm} BPM)`}
              // Telefon: samo ikona; ob kliku (odprt meni) se razširi z napisom — kot Hitrost.
              className={`flex h-[26px] items-center max-lg:order-5 whitespace-nowrap rounded-full border border-orange-400 dark:border-white/15 text-xs font-medium transition-all duration-200 active:scale-95 lg:gap-1.5 lg:px-2.5 ${
                metroMenuPos ? "gap-1.5 px-2.5" : "max-lg:w-[26px] max-lg:justify-center"
              } ${metroMenuPos || metroOn ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"}`}
            >
              {/* Metronom (piramida z nihalom). */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 text-amber-400 ${metroOn ? "animate-pulse" : ""}`}>
                <path d="M9 3h6l4 18H5z" />
                <path d="M7.5 15h9" />
                <path d="m12 15 4.5-9" />
              </svg>
              <span className={metroMenuPos ? "" : "max-lg:hidden"}>Metronom</span>
              {metroOn && <span className={`tabular-nums ${metroMenuPos ? "" : "max-lg:hidden"}`}>{metroBpm}</span>}
            </button>
            {metroMenuPos && (
              <div
                data-metro-menu
                aria-label="Metronom"
                style={{ top: metroMenuPos.top, left: metroMenuPos.left }}
                className="fixed z-50 flex w-52 flex-col gap-2 rounded-xl border border-orange-400/70 bg-neutral-900/95 p-3 text-sm text-neutral-200 shadow-xl backdrop-blur"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setMetroBpm(metroBpm - METRO_STEP)}
                    disabled={metroBpm <= METRO_MIN}
                    aria-label={`Počasneje (−${METRO_STEP} BPM)`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-lg transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
                  >
                    −
                  </button>
                  <div className="text-center leading-tight">
                    <div className="text-2xl font-semibold tabular-nums text-amber-400">{metroBpm}</div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-400">BPM</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMetroBpm(metroBpm + METRO_STEP)}
                    disabled={metroBpm >= METRO_MAX}
                    aria-label={`Hitreje (+${METRO_STEP} BPM)`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-lg transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!metroOn) metronome.prime();
                    setMetroOn((v) => !v);
                  }}
                  aria-pressed={metroOn}
                  className={`rounded-full py-1.5 font-medium transition active:scale-95 ${
                    metroOn ? "bg-orange-400/20 text-amber-400" : "bg-orange-500 text-white hover:bg-orange-400"
                  }`}
                >
                  {metroOn ? "Ustavi" : "Začni"}
                </button>
                <button
                  type="button"
                  onClick={() => setMetroBpm(songBpm ?? 100)}
                  disabled={metroBpm === (songBpm ?? 100)}
                  className="text-xs text-neutral-400 transition hover:text-white disabled:opacity-50"
                >
                  {songBpm ? `Tempo skladbe: ${songBpm} BPM` : "Tempo skladbe še ni izmerjen (100 BPM)"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-1 lg:border-l lg:border-white/15 lg:pl-3 xl:pl-2 2xl:pl-3">
          <span className="hidden px-1 text-[9px] font-medium uppercase tracking-[0.08em] text-orange-400 lg:block">Nastavitve</span>
          <div className="contents lg:flex lg:items-center lg:gap-2">
            <button
              ref={themeButtonRef}
              type="button"
              onClick={toggleThemeMenu}
              aria-expanded={themeMenuPos !== null}
              aria-label="Nastavitve"
              title="Nastavitve"
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 dark:border-white/15 transition active:scale-95 max-lg:order-11 ${
                themeMenuPos ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {/* Zloži orodno vrstico — predvajalnik zgoraj ostane; nazaj s puščico v njegovi vrstici. */}
            <button
              type="button"
              onClick={() => {
                closeThemeMenu();
                setToolbarCollapsed(true);
              }}
              aria-label="Zloži orodno vrstico"
              title="Zloži orodno vrstico"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-neutral-200 transition hover:text-white active:scale-95 max-lg:order-13"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m18 15-6-6-6 6" />
              </svg>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={rotateOn ? exitRotate : enterRotate}
          aria-pressed={rotateOn}
          aria-label={rotateOn ? "Nazaj pokončno" : "Zasukaj zaslon"}
          title={rotateOn ? "Nazaj pokončno" : "Zasukaj zaslon (ležeče)"}
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-full border border-orange-400 dark:border-white/15 transition active:scale-95 max-lg:order-12 lg:hidden ${
            rotateOn ? "bg-orange-400/15 text-amber-400" : "text-neutral-200 hover:text-white"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <rect x="3" y="9" width="14" height="10" rx="1.8" />
            <path d="M7 5.5A6 6 0 0 1 17.5 4" />
            <path d="m16 2 1.6 2.1L15.4 5.6" />
          </svg>
        </button>
      </div>
      </div>
      </div>
          <div className="pt-4 font-mono leading-snug text-(--cv-text)" style={{ fontSize }}>
            <div className="relative mb-4 flex flex-wrap items-start gap-x-8 gap-y-3 font-sans max-lg:gap-x-3">
            {/* Telefon: naslov čez celo širino — okenca (Posebni akordi, Nasvet, Ali si vedel?,
                Kviz, Opis) so vedno v svoji vrstici pod avtorjem, samo ikone. */}
            <div className={`shrink-0 max-lg:basis-full ${nav ? "pr-24 lg:pr-0" : ""}`}>
              <h2 className="text-xl font-semibold text-(--cv-title)">{song.title}</h2>
              <p className="text-sm text-(--cv-muted)">{song.author}</p>
              {capo !== null && (
                <p className="mt-1 text-sm font-medium text-(--cv-chord)">
                  {capoShift ? `Brez capa (izvirno capo ${capo}, akordi +${capo})` : `Capo: ${capo}. prag`}
                </p>
              )}
            </div>
            {/* Prijemi akordov (najprej iz opisa, nato iz baze) — izbrana različica, ‹ › pod
                akordom zamenja različico (enako kot v oknu ob akordu). Privzeto samo posebni
                akordi; "Pokaži akorde" prikaže vse (posebni so označeni). */}
            {shapeChords.length > 0 && (
              <div
                className={`relative z-10 self-start rounded-xl border px-2 py-1.5 lg:px-2.5 ${showShapes ? "border-(--cv-border)" : "border-orange-400/40 bg-orange-400/[0.05]"}`}
                aria-label={showShapes ? "Akordi v skladbi" : "Posebni akordi"}
              >
                <button
                  type="button"
                  onClick={() => setShapesOpen((v) => !v)}
                  aria-expanded={shapesOpen}
                  title={showShapes ? "Akordi v skladbi" : "Posebni akordi"}
                  className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-(--cv-chord)"
                >
                  {/* Telefon: samo ikona (prijem akorda), kot Nasvet / Ali si vedel? desno od nje. */}
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 lg:hidden">
                    <rect x="5" y="3" width="14" height="18" rx="1.5" />
                    <path d="M5 8h14M5 13h14M10 3v18M14 3v18" />
                    <circle cx="10" cy="10.5" r="1.3" fill="currentColor" />
                    <circle cx="14" cy="15.5" r="1.3" fill="currentColor" />
                  </svg>
                  <span className="hidden lg:inline">{showShapes ? "Akordi v skladbi" : "Posebni akordi"}</span>
                  {/* Zaprto okno (samo računalnik): seznam akordov, če jih je največ 5 (sicer le število). */}
                  {!shapesOpen && (
                    <span className="hidden truncate font-normal lg:inline normal-case tracking-normal text-(--cv-muted)">
                      · {shapeChords.length <= 5 ? shapeChords.join(", ") : `${shapeChords.length} akordov`}
                    </span>
                  )}
                  {shapesOpen && showShapes && specialChords.length > 0 && (
                    <span className="hidden font-normal normal-case tracking-normal text-(--cv-muted) lg:inline">· posebni so obrobljeni</span>
                  )}
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto hidden h-3.5 w-3.5 shrink-0 transition lg:block ${shapesOpen ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              {shapesOpen && (
              <div className="absolute left-0 top-full mt-1.5 flex w-max max-w-[min(48rem,calc(100vw-2rem))] flex-wrap gap-x-2 gap-y-2 rounded-xl border border-(--cv-border) bg-(--cv-bg) p-2.5 shadow-2xl">
                {shapeChords.map((name) => {
                  const special = showShapes && specialChords.includes(name);
                  const own = descShapes.get(name);
                  const positions = mergeShapes(own, chordDb ? findChordShapes(chordDb, name) : []);
                  const index = Math.min(shapeChoice[name] ?? 0, Math.max(0, positions.length - 1));
                  const position = positions[index];
                  return position ? (
                    <div key={name} className={`flex flex-col items-center ${special ? "rounded-lg ring-1 ring-orange-400/60" : ""}`}>
                      <ChordDiagram name={name} position={position} />
                      {positions.length > 1 && (
                        <div className="flex w-full items-center justify-between font-sans">
                          <button
                            type="button"
                            onClick={() => stepShapeOf(name, positions.length, -1)}
                            aria-label={`Prejšnja različica prijema ${name}`}
                            title="Prejšnja različica"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-(--cv-chord) hover:bg-orange-400/15 active:scale-95"
                          >
                            ‹
                          </button>
                          <span className="text-[10px] tabular-nums text-(--cv-muted)">
                            {index + 1}/{positions.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => stepShapeOf(name, positions.length, 1)}
                            aria-label={`Naslednja različica prijema ${name}`}
                            title="Naslednja različica"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none text-(--cv-chord) hover:bg-orange-400/15 active:scale-95"
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span key={name} className="px-2 text-sm font-bold text-(--cv-chord)" title="Prijem ni znan">
                      {name}
                    </span>
                  );
                })}
              </div>
              )}
              </div>
            )}
            {/* "Nasvet": ponavljajoča se zaporedja akordov (shranil skill spedenaj v
                songs.chord_tips; imena prikazana s transpozicijo / Simpl / No capo). */}
            {song.chord_tips && (song.chord_tips.whole || song.chord_tips.parts.length > 0) && (
              <div ref={tipsRef} className="z-10 self-start rounded-xl border border-violet-400/40 bg-violet-400/[0.05] px-2 py-1.5 lg:relative lg:px-2.5" aria-label="Nasvet">
                {/* Telefon: samo ikona (desno od Posebni akordi), okno čez celo vrstico. */}
                <button
                  type="button"
                  onClick={() => setTipsOpen((v) => !v)}
                  aria-expanded={tipsOpen}
                  title="Nasvet"
                  className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-violet-400"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
                  </svg>
                  <span className="hidden lg:inline">Nasvet</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto hidden h-3.5 w-3.5 transition lg:block ${tipsOpen ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {tipsOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1.5 divide-y max-lg:right-0 lg:w-[min(36rem,calc(100vw-2rem))] divide-violet-400/25 rounded-xl border border-violet-400/50 bg-(--cv-bg) p-3 text-xs text-(--cv-text) shadow-2xl lg:p-4 lg:text-sm">
                    {song.chord_tips.whole ? (
                      <div className="py-2 first:pt-0">
                        <p className="text-sm font-medium lg:text-base">Akordi se čez celo skladbo ponavljajo:</p>
                        {tipRows(song.chord_tips.whole.map(display))}
                        {tipShapes && tipShapeRow(song.chord_tips.whole.map(display))}
                      </div>
                    ) : (
                      song.chord_tips.parts.map((part) => (
                        <div key={part.label} className="py-2 first:pt-0">
                          <p className="text-sm font-semibold lg:text-base">
                            {part.label}
                            <span className="font-normal text-(--cv-muted)">
                              {part.which && part.of
                                ? ` · ${part.which.join(", ")} (${part.count} od ${part.of})`
                                : part.count > 1
                                  ? ` · ${part.count}× vedno isto`
                                  : " · ponavlja se"}
                            </span>
                          </p>
                          {tipRows(part.unit.map(display))}
                          {tipShapes && tipShapeRow(part.unit.map(display))}
                        </div>
                      ))
                    )}
                    {song.chord_tips.sameVerseChorus && <p className="py-2 text-sm font-medium text-violet-300 lg:text-base">Kitica in refren imata enako zaporedje.</p>}
                    <button
                      type="button"
                      onClick={() => setTipShapes((v) => !v)}
                      aria-pressed={tipShapes}
                      className={`mt-2 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition lg:px-3 lg:py-1 lg:text-xs ${
                        tipShapes ? "border-violet-400 bg-violet-400/15 text-violet-300" : "border-violet-400/50 text-violet-400 hover:bg-violet-400/10"
                      }`}
                    >
                      {tipShapes ? "Skrij akorde" : "Prikaži akorde"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* "Ali si vedel?": o čem govori pesem in 5 zanimivosti (skill spedenaj → songs.song_story). */}
            {song.song_story && (
              <div ref={storyRef} className="z-10 self-start rounded-xl border border-emerald-400/40 bg-emerald-400/[0.05] px-2 py-1.5 lg:relative lg:px-2.5" aria-label="Ali si vedel?">
                <button
                  type="button"
                  onClick={() => setStoryOpen((v) => !v)}
                  aria-expanded={storyOpen}
                  title="Ali si vedel?"
                  className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-emerald-400"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
                  </svg>
                  {/* Telefon: samo ikona, okno čez celo vrstico. */}
                  <span className="hidden lg:inline">Ali si vedel?</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto hidden h-3.5 w-3.5 transition lg:block ${storyOpen ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {storyOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[70vh] overflow-y-auto lg:w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-emerald-400/50 bg-(--cv-bg) p-3 font-sans text-sm leading-relaxed text-(--cv-text) shadow-2xl lg:left-0 lg:right-auto lg:p-4 lg:text-base">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">O pesmi</p>
                    {song.song_story.about.split(/\n\s*\n/).map((para, i) => (
                      <p key={i} className="mb-2">
                        {para}
                      </p>
                    ))}
                    <p className="mb-1.5 mt-3 border-t border-emerald-400/25 pt-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">5 zanimivosti</p>
                    <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-emerald-400">
                      {song.song_story.facts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            {/* Kviz: ugibanje akordov po delih skladbe (ChordQuiz.tsx). */}
            {improChords.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuizOpen((v) => !v);
                  setImproOpen(false);
                }}
                aria-pressed={quizOpen}
                aria-label="Kviz"
                title="Kviz"
                className={`relative z-10 flex items-center gap-1.5 self-start rounded-xl border px-2 py-1.5 lg:px-2.5 text-[11px] font-semibold uppercase tracking-wide transition lg:text-xs ${
                  quizOpen ? "border-rose-400 bg-rose-400/20 text-rose-200" : "border-rose-400/40 bg-rose-400/[0.05] text-rose-300 hover:bg-rose-400/10"
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 lg:h-4 lg:w-4">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
                <span className="hidden lg:inline">Kviz</span>
              </button>
            )}
            {/* Opis skladbe (desno od Kviza). */}
            {description.length > 0 && (
              <button
                type="button"
                onClick={() => setDescriptionOpen((v) => !v)}
                aria-expanded={descriptionOpen}
                aria-label="Opis skladbe"
                title="Opis skladbe"
                className={`relative z-10 flex h-7 w-7 self-start items-center justify-center rounded-full border text-(--cv-text) transition hover:border-amber-400 ${descriptionOpen ? "border-amber-400 bg-amber-400/10" : "border-(--cv-border)"}`}
              >
                {/* Dokument z vrsticami: opis skladbe (album, opombe …). */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M8 13h8M8 17h5" />
                </svg>
              </button>
            )}
            {/* Naprej/nazaj po seznamu, iz katerega je bila skladba odprta. */}
            {nav && (
              // Zgoraj desno v vrstici z naslovom (absolutno) — mesto ni odvisno od okenc
              // levo, zato ob listanju ne skače; ozek.
              <div className="absolute right-0 top-0 flex items-center rounded-lg border border-sky-400/40 bg-sky-400/[0.05] px-0.5" title={nav.label}>
                <button
                  type="button"
                  onClick={nav.onPrev}
                  disabled={!nav.prev}
                  title={nav.prev ? `Prejšnja: ${nav.prev.title} – ${nav.prev.author}` : undefined}
                  aria-label={nav.prev ? `Prejšnja skladba: ${nav.prev.title}` : "Prejšnja skladba"}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-sky-400 transition hover:bg-sky-400/15 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span className="px-0.5 text-center font-sans text-[11px] tabular-nums text-sky-300">
                  {nav.index + 1}/{nav.count}
                </span>
                <button
                  type="button"
                  onClick={nav.onNext}
                  disabled={!nav.next}
                  title={nav.next ? `Naslednja: ${nav.next.title} – ${nav.next.author}` : undefined}
                  aria-label={nav.next ? `Naslednja skladba: ${nav.next.title}` : "Naslednja skladba"}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-sky-400 transition hover:bg-sky-400/15 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
            </div>
            {quizOpen ? (
              <ChordQuiz body={body} display={display} onClose={() => setQuizOpen(false)} />
            ) : (
            <>
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
                    ? "-ml-2 -mr-1 rounded-r-md bg-[color-mix(in_srgb,var(--cv-text)_8%,transparent)] pl-2 pr-1 shadow-[inset_1.5px_0_0_var(--cv-line)] lg:w-fit lg:shadow-[inset_2px_0_0_var(--cv-line)]"
                    : "-ml-2 -mr-1 pl-2 pr-1 lg:w-fit"
                }
              >
                {renderLine(l, i, true)}
              </div>
            ))}
            </>
            )}
          </div>
        </div>
        {/* Telefon: pod pesmijo (vodoravno). Računalnik: navpičen stolpec ob desnem
            robu pod zgornjima vrsticama — TAP, ↶ ↷ Preskoči Konec, deli z akordi
            (se drsijo), spodaj Prekliči / Shrani. */}
        {recorder && (
          <div
            className="relative z-30 shrink-0 border-t border-orange-400 bg-neutral-950/95 px-3 pt-2 font-sans text-neutral-100 backdrop-blur lg:flex lg:w-[22rem] lg:flex-col lg:overflow-hidden lg:border-l lg:border-t-0 lg:pt-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto max-w-2xl lg:mx-0 lg:flex lg:min-h-0 lg:max-w-none lg:flex-1 lg:flex-col">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-neutral-300">
                <span>
                  Posnemi čase ·{" "}
                  {recorder.cursor >= 0
                    ? `vrstica ${lyricLines.indexOf(recorder.cursor) + 1}/${lyricLines.length}`
                    : "konec besedila"}
                </span>
              </div>
              <p className="hidden text-[11px] leading-snug text-neutral-500 lg:order-5 lg:mt-2 lg:block">
                Preslednica = TAP · Backspace = nazaj · Shift+Backspace = ponovi · klik na akord = v izbrani del
              </p>
              {recorderMsg && <p className="mb-2 text-xs text-amber-400">{recorderMsg}</p>}
              {/* Zakaj je Shrani (še) onemogočen. */}
              {!recorderMsg && (!recorder.dirty || !recordVideoId) && (
                <p className="mb-2 text-[11px] text-neutral-500">
                  {!recorder.dirty ? "Shrani bo na voljo, ko kaj natapkaš ali spremeniš." : "Za shranjevanje enkrat zaženi posnetek z ▶."}
                </p>
              )}
              <div className="mb-2 flex flex-wrap items-stretch gap-1.5 text-sm lg:order-2 lg:grid lg:grid-cols-4">
                <button
                  type="button"
                  onClick={cancelRecorder}
                  className="rounded-xl border border-neutral-600 px-3 py-2 text-neutral-300 active:scale-95 lg:hidden"
                >
                  Prekliči
                </button>
                <button
                  type="button"
                  onClick={undoTap}
                  disabled={!recorder.history.length}
                  aria-label="Razveljavi zadnji zapis"
                  className="rounded-xl border border-neutral-600 px-3 text-lg text-neutral-300 active:scale-95 disabled:opacity-40 lg:py-2"
                >
                  ↶
                </button>
                <button
                  type="button"
                  onClick={redoTap}
                  disabled={!recorder.future.length}
                  aria-label="Ponovi razveljavljeno"
                  title="Ponovi razveljavljeno (Shift+Backspace)"
                  className="rounded-xl border border-neutral-600 px-3 text-lg text-neutral-300 active:scale-95 disabled:opacity-40 lg:py-2"
                >
                  ↷
                </button>
                <button
                  type="button"
                  onClick={skipLine}
                  disabled={recorder.cursor < 0}
                  className="rounded-xl border border-neutral-600 px-3 text-neutral-300 active:scale-95 disabled:opacity-40 lg:px-1 lg:py-2"
                >
                  Preskoči
                </button>
                <button
                  type="button"
                  onClick={recordStop}
                  disabled={!recorder.activeId}
                  title="Konec izbranega dela: od tu ni obarvan noben akord"
                  className="rounded-xl border border-neutral-600 px-3 text-neutral-300 active:scale-95 disabled:opacity-40 lg:px-1 lg:py-2"
                >
                  Konec
                </button>
                <button
                  type="button"
                  onClick={saveRecorder}
                  disabled={!recorder.dirty || !recordVideoId || recorderSaving}
                  className="ml-auto rounded-xl border border-orange-400 px-3 py-2 font-semibold text-amber-400 active:scale-95 disabled:opacity-40 lg:hidden"
                >
                  {recorderSaving ? "…" : "Shrani"}
                </button>
              </div>
              <div className="flex items-stretch gap-2 lg:contents">
                <button
                  type="button"
                  // Čas ob PRITISKU (miška/prst), ne ob spustu kot onClick — sicer je
                  // vsak TAP 0,1–0,2 s prepozen. Tipkovnica (detail 0) prek onClick.
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    recordTap();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) recordTap();
                  }}
                  disabled={recorder.cursor < 0}
                  className="w-2/5 shrink-0 rounded-xl bg-orange-500 py-4 text-lg font-bold tracking-wide text-white active:scale-[0.98] disabled:opacity-40 lg:order-1 lg:mb-2 lg:w-full lg:py-8 lg:text-2xl"
                >
                  TAP
                  <span className="block text-[10px] font-medium tracking-normal opacity-80">vrstica</span>
                </button>
                {/* Instrumentalni deli: izbrani prejme klike na akorde. */}
                <div className="min-w-0 flex-1 rounded-xl border border-neutral-700 p-1 lg:order-3 lg:flex lg:min-h-0 lg:flex-col">
                  <p className="hidden px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 lg:block">Deli z akordi</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
                    {/* Po vrstnem redu v skladbi (vrstica, nato čas prvega akorda); deli brez akordov na koncu. */}
                    {[...recorder.sections]
                      .map((section, order) => {
                        const first = section.points.reduce<{ line: number; t: number } | null>(
                          (m, p) => (!m || p.line < m.line || (p.line === m.line && p.t < m.t) ? { line: p.line, t: p.t } : m),
                          null,
                        );
                        return { section, order, line: first?.line ?? Infinity, t: first?.t ?? Infinity };
                      })
                      .sort((a, b) => a.line - b.line || a.t - b.t || a.order - b.order)
                      .map(({ section }) => {
                      const active = section.id === recorder.activeId;
                      const off = sectionOffset(section, isPhone);
                      const times = section.points.map((p) => p.t + off);
                      const from = times.length ? Math.min(...times) : null;
                      const to = times.length
                        ? (section.end != null ? section.end + off : Math.max(...times) + 4)
                        : null;
                      const listOpen = openChordLists.has(section.id);
                      // Akordi po času (indeks k = mesto v section.points, ki ga premik spremeni).
                      const ordered = section.points.map((p, k) => ({ p, k })).sort((a, b) => a.p.t - b.p.t);
                      return (
                        <div
                          key={section.id}
                          className={`rounded-lg border text-[11px] ${active ? "border-orange-400 bg-orange-400/10" : "border-transparent bg-neutral-900"}`}
                        >
                        <div className="flex items-center gap-1 px-1.5 py-1">
                          {/* Prazen prostor desno od imena in vrstica pod njim del samo izbereta. */}
                          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setRecorder({ ...recorder, activeId: section.id })}>
                            {renamingId === section.id ? (
                              <input
                                autoFocus
                                defaultValue={section.name}
                                onFocus={(e) => e.currentTarget.select()}
                                onBlur={(e) => commitRename(section.id, e.currentTarget.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  else if (e.key === "Escape") setRenamingId(null);
                                }}
                                aria-label="Ime dela"
                                className="block w-full min-w-0 rounded border border-orange-400 bg-neutral-950 px-1 font-semibold text-amber-400 outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecorder({ ...recorder, activeId: section.id });
                                  setRenamingId(section.id);
                                }}
                                title="Klikni za preimenovanje"
                                className={`block max-w-full truncate text-left font-semibold hover:underline ${active ? "text-amber-400" : "text-neutral-100"}`}
                              >
                                {section.name}
                              </button>
                            )}
                            <span className="flex min-w-0 items-center gap-1 text-[10px] text-neutral-500">
                              {from != null && to != null && <span className="truncate">{`${formatSec(from)}–${formatSec(to)}`}</span>}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleChordList(section.id);
                                }}
                                disabled={!section.points.length}
                                aria-expanded={listOpen}
                                title={listOpen ? "Skrij akorde" : "Pokaži akorde — vsakemu posebej nastaviš čas"}
                                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px font-medium transition-colors disabled:opacity-40 ${
                                  listOpen
                                    ? "border-orange-400 bg-orange-400/15 text-amber-300"
                                    : "border-neutral-600 text-neutral-300 hover:border-orange-400/70 hover:text-amber-300"
                                }`}
                              >
                                {chordCountLabel(section.points.length)}
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={`h-2.5 w-2.5 transition-transform ${listOpen ? "rotate-180" : ""}`}>
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </button>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRenamingId(section.id)}
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
                            onClick={() => updateSection(section.id, (s) => shiftSectionOffset(s, -LRC_OFFSET_STEP))}
                            aria-label="Zamik −0,25 s"
                            className="rounded border border-neutral-600 px-1 text-neutral-300"
                          >
                            −
                          </button>
                          <span className="w-9 text-center tabular-nums text-neutral-300">
                            {off > 0 ? "+" : ""}
                            {off.toFixed(2).replace(".", ",")}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateSection(section.id, (s) => shiftSectionOffset(s, LRC_OFFSET_STEP))}
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
                        {/* Akordi dela po vrsti: čas vsakega posebej (−/+), ▶ predvaja od 1,5 s pred njim.
                            Zamik dela (zgoraj) se prišteje vsem — tu je prikazan končni čas. */}
                        {listOpen && section.points.length > 0 && (
                          <ol className="mx-1.5 mb-1.5 divide-y divide-neutral-800 overflow-hidden rounded-md border border-neutral-700 bg-neutral-950">
                            {ordered.map(({ p, k }, n) => (
                              <li key={k} className="flex items-center gap-1 px-1.5 py-1">
                                <span className="w-4 shrink-0 text-right tabular-nums text-neutral-500">{n + 1}</span>
                                <span className="min-w-[2.75rem] shrink-0 truncate font-mono font-bold text-amber-400">{chordNameAt(p.line, p.chord)}</span>
                                <span className="flex-1 tabular-nums text-neutral-200">{formatSecFine(p.t + off)}</span>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  {[
                                    { d: -0.25, label: "−¼", title: "0,25 s prej" },
                                    { d: -0.05, label: "−", title: "0,05 s prej" },
                                    { d: 0.05, label: "+", title: "0,05 s kasneje" },
                                    { d: 0.25, label: "+¼", title: "0,25 s kasneje" },
                                  ].map((b) => (
                                    <button
                                      key={b.d}
                                      type="button"
                                      onClick={() => shiftChordPoint(section.id, k, b.d)}
                                      title={b.title}
                                      aria-label={`${chordNameAt(p.line, p.chord)} ${b.title}`}
                                      className="h-6 min-w-[1.6rem] rounded border border-neutral-600 px-1 text-neutral-200 hover:border-orange-400 hover:text-amber-300 active:scale-95"
                                    >
                                      {b.label}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => previewChordAt(p.t + off)}
                                    title="Predvajaj od 1,5 s pred tem akordom"
                                    aria-label={`Predvajaj od ${chordNameAt(p.line, p.chord)}`}
                                    className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-amber-400 hover:bg-orange-400/15 active:scale-95"
                                  >
                                    ▶
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeChordPoint(section.id, k)}
                                    title="Odstrani ta akord (↶ ga vrne)"
                                    aria-label={`Odstrani ${chordNameAt(p.line, p.chord)} pri ${formatSecFine(p.t + off)}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-red-500/15 hover:text-red-400 active:scale-95"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
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
              {/* Računalnik: Prekliči / Shrani na dnu stolpca. */}
              <div className="hidden gap-1.5 pt-2 text-sm lg:order-4 lg:flex">
                <button
                  type="button"
                  onClick={cancelRecorder}
                  className="flex-1 rounded-xl border border-neutral-600 py-2 text-neutral-300 active:scale-95"
                >
                  Prekliči
                </button>
                <button
                  type="button"
                  onClick={saveRecorder}
                  disabled={!recorder.dirty || !recordVideoId || recorderSaving}
                  className="flex-1 rounded-xl border border-orange-400 py-2 font-semibold text-amber-400 active:scale-95 disabled:opacity-40"
                >
                  {recorderSaving ? "…" : "Shrani"}
                </button>
              </div>
            </div>
          </div>
        )}
        {improOpen && <ImproPanel chords={improChords} currentChord={improCurrentChord} capo={capoShift ? null : capo} onClose={() => setImproOpen(false)} />}
      </div>

      {ssVolMsg && (
        <div role="status" className="pointer-events-none fixed left-1/2 top-6 z-[60] -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 font-sans text-sm font-semibold text-white shadow-lg backdrop-blur">
          {ssVolMsg}
        </div>
      )}
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
          // Sam Špili: nad prekrivnim slojem (z-40), pod njegovim menijem ⚙ (z-50).
          className={`fixed ${samSpili ? "z-[45]" : "z-20"} rounded-xl border border-orange-400 bg-(--cv-panel) px-2 pb-1 pt-1.5 shadow-xl`}
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


      {shared && shared.role !== "leader" && !(shared.role === "follower" && followPillHidden) && (
        <div
          className="fixed left-1/2 z-50 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2.5 rounded-full border border-fuchsia-400/70 bg-neutral-950/90 py-1.5 pl-4 pr-1.5 font-sans text-sm text-neutral-100 shadow-lg backdrop-blur"
          style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
        >
          <span className="whitespace-nowrap">
            {shared.role === "follower" ? "Slediš: " : "Vodi: "}
            <span className="font-semibold text-fuchsia-300">{shared.leaderName}</span>
          </span>
          {shared.role === "follower" && remoteFullscreen && !isFullscreen && canBrowserFullscreen() && (
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
      {!editing && !smartActive && !recorder && !follower && !samSpili ? (
        <AutoScrollControl
          scrollRef={scrollRef}
          speedFactor={2.5}
          onPlayingChange={setFullscreen}
          above={fontButtons}
          controlRef={autoScrollCtlRef}
          desktopSpeed={2}
          onPlayClick={() => startPlayView("autoscroll")}
        />
      ) : (
        !editing &&
        !samSpili &&
        fontButtons && <div className="fixed right-4 bottom-4 z-10">{fontButtons}</div>
      )}

      {/* "Sam Špili": prekrije pregledovalnik (predvajalnik ostane spodaj in igra). */}
      {samSpili && (
        <div
          className="absolute inset-0 z-40 isolate flex flex-col overflow-hidden bg-(--cv-bg) text-(--cv-text) ss-root"
          style={{ backgroundImage: "gradient" in theme ? theme.gradient : undefined }}
          onClick={follower ? ssFollowerFullscreen : undefined}
        >

          {/* Sledilec na telefonu: vodja je začel igrati, celozaslonsko še ni —
              en dotik kamorkoli preklopi v celozaslonsko ležeče. */}
          {follower && ssShowLines && !ssIsFullscreen && !ssFsPromptDismissed && canBrowserFullscreen() &&
            typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  ssFollowerFullscreen();
                }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 text-white backdrop-blur-sm"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-orange-400">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
                <span className="text-xl font-semibold">Tapni za celozaslonski način</span>
                <span className="text-sm text-white/70">{follower.leaderName || "Vodja"} je začel igrati — zasukaj telefon ležeče</span>
              </button>
            )}
          {theme.pattern && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <PatternSvg id={theme.pattern} colors={isPhone ? ssPhonePatternColors : patternColors} className="h-full w-full" />
            </div>
          )}
          {ssShowLines ? (
            <>
              {/* Blaga navpična črta levo od stolpca gumbov — besedilo se konča pred njo;
                  skrije se skupaj s stransko vrstico. */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 z-10 w-px bg-(--cv-text) transition-opacity duration-300 ${ssSidebarOpen ? "opacity-15" : "opacity-0"}`}
                style={{ right: "calc(max(0.75rem, env(safe-area-inset-right)) + var(--ss-btn) + 0.625rem)" }}
              />
              {/* Desno zgoraj: ✕ in pod njim gumb Meni (oba vedno vidna, enako kot na
                  začetnem zaslonu), pod njima
                  stranska vrstica (pavza/play, na začetek, ±5 s, prevrtavanje,
                  nastavitve), ki se skrije desno čez rob. Stekleni gumbi v barvah teme. */}
              <div
                style={{ top: "max(0.75rem, env(safe-area-inset-top))", right: "max(0.75rem, env(safe-area-inset-right))" }}
                className="absolute z-10 flex flex-col gap-2"
              >
              {/* Izhod: vedno viden, na vrhu (nad gumbom Meni). */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Zapri"
                title="Zapri"
                className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleSsSidebar}
                aria-label={ssSidebarOpen ? "Skrij meni" : "Pokaži meni"}
                title={ssSidebarOpen ? "Skrij meni" : "Pokaži meni"}
                aria-expanded={ssSidebarOpen}
                className={`flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 ${ssSidebarOpen ? "bg-[color-mix(in_srgb,var(--cv-text)_18%,transparent)]" : "bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Telefon: zasuk v pokončni / ležeči način (pod gumbom Meni; skrit, ko je meni odprt). */}
              {!ssSidebarOpen && (
              <button
                type="button"
                onClick={ssToggleOrientation}
                aria-label={portrait ? "Ležeče" : "Pokončno"}
                title={portrait ? "Zasukaj v ležeči način" : "Zasukaj v pokončni način"}
                className="flex h-(--ss-btn) w-(--ss-btn) items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)] lg:hidden"
              >
                {/* Telefon, nagnjen med obema legama, + puščici v krogu: "zasukaj". */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-[calc(var(--ss-btn)*0.55)] w-[calc(var(--ss-btn)*0.55)] transition-transform duration-300 ${portrait ? "rotate-90" : ""}`}>
                  <rect x="8.5" y="6.5" width="7" height="11" rx="1.4" transform="rotate(-45 12 12)" />
                  <path d="M3.5 9.5A9 9 0 0 1 14 3.2" />
                  <path d="M11.6 1.6 14 3.2l-1.6 2.4" />
                  <path d="M20.5 14.5A9 9 0 0 1 10 20.8" />
                  <path d="M12.4 22.4 10 20.8l1.6-2.4" />
                </svg>
              </button>
              )}
              <div
                aria-hidden={!ssSidebarOpen}
                inert={!ssSidebarOpen}
                className={`flex flex-col gap-2 transition duration-300 ease-out ${ssSidebarOpen ? "" : "pointer-events-none translate-x-[calc(100%+2rem)] opacity-0"}`}
              >
              {/* Sledilec (Skupni Jam) nima lastnega predvajanja — samo meni in ⚙. */}
              {!follower && (
              <>
              {/* Pavza pusti pogled, kot je; isti gumb nato predvaja naprej. */}
              <button
                type="button"
                onClick={ssActive ? ssPause : ssPlay}
                disabled={!ssActive && ssRequested}
                aria-label={ssActive ? "Pavza" : "Predvajaj"}
                title={ssActive ? "Pavza" : "Predvajaj"}
                className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
              >
                {ssActive ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                    <path d="M7 5v14l12-7z" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (playerCtlRef.current?.seekAndPlay(0)) setSsActive(true);
                }}
                aria-label="Na začetek"
                title="Na začetek"
                className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M6 5v14" />
                  <path d="M18 19 9 12l9-7z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => playerCtlRef.current?.seekBy(5)}
                aria-label="5 s naprej"
                title="5 s naprej"
                className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M13 19l7-7-7-7" /><path d="M5 19l7-7-7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => playerCtlRef.current?.seekBy(-5)}
                aria-label="5 s nazaj"
                title="5 s nazaj"
                className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M11 19l-7-7 7-7" /><path d="M19 19l-7-7 7-7" />
                </svg>
              </button>
              <button type="button" onClick={() => ssChangeVolume(5)} aria-label="Glasneje" title="Glasneje (↑)" className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
                  <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
                </svg>
              </button>
              <button type="button" onClick={() => ssChangeVolume(-5)} aria-label="Tišje" title="Tišje (↓)" className="flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
                  <path d="M16 12h5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSsSeekOpen((o) => !o)}
                aria-label="Prevrtavanje"
                title="Prevrtavanje"
                aria-pressed={ssSeekOpen}
                className={`flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 ${ssSeekOpen ? "bg-[color-mix(in_srgb,var(--cv-text)_18%,transparent)]" : "bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M3 12h4M13 12h8" /><circle cx="10" cy="12" r="3" />
                </svg>
              </button>
              </>
              )}
              {/* Nastavitve: isti meni ⚙ kot v pregledovalniku (brez urejanja in snemanja). */}
              <button
                ref={ssSettingsRef}
                type="button"
                onClick={toggleSsSettings}
                aria-label="Nastavitve"
                title="Nastavitve"
                aria-expanded={themeMenuPos !== null}
                className={`flex h-(--ss-btn) w-(--ss-btn) lg:h-14 lg:w-14 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 ${themeMenuPos ? "bg-[color-mix(in_srgb,var(--cv-text)_18%,transparent)]" : "bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[calc(var(--ss-btn)*0.45)] w-[calc(var(--ss-btn)*0.45)] lg:h-6 lg:w-6">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              </div>
              </div>
              {/* Velikost besedila: + nad − spodaj desno (fino nastavljanje med predvajanjem);
                  skrita, ko je odprt meni (njegov ⚙ je na istem mestu) ali drsnik. */}
              {ssShowLines && !ssSeekOpen && !ssSidebarOpen && (
                <div
                  className="absolute z-20 flex flex-col items-center gap-2 font-sans"
                  style={{
                    bottom: "max(0.75rem, env(safe-area-inset-bottom))",
                    right: "max(0.75rem, env(safe-area-inset-right))",
                  }}
                >
                  {([
                    [SS_SCALE_STEP, "+", "Večje besedilo", ssScale >= SS_SCALE_MAX],
                    [-SS_SCALE_STEP, "−", "Manjše besedilo", ssScale <= SS_SCALE_MIN],
                  ] as const).map(([delta, sign, label, off]) => (
                    <button
                      key={sign}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        changeSsScale(delta);
                      }}
                      disabled={off}
                      aria-label={label}
                      title={`${label} (${Math.round(ssScale * 100)} %)`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)] text-lg leading-none disabled:opacity-30"
                    >
                      {sign}
                    </button>
                  ))}
                </div>
              )}
              {/* Prevrtavanje: drsnik čez celo skladbo, kot v mini predvajalniku. */}
              {ssSeekOpen && (
                <div
                  className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-orange-400/40 bg-(--cv-bg)/90 font-sans backdrop-blur"
                  style={{
                    paddingTop: "0.75rem",
                    paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                    paddingLeft: "max(1rem, env(safe-area-inset-left))",
                    paddingRight: "max(1rem, env(safe-area-inset-right))",
                  }}
                >
                  <span className="shrink-0 text-sm tabular-nums opacity-70">{fmtClock(ssTime)}</span>
                  {/* Drsnik z majhnimi oznakami delov (Intro, Verse 1, Chorus …): napis nad
                      drsnikom, pri gneči pod njim, sicer samo črtica; dotik skoči na del. */}
                  <div ref={setSsTrackEl} className="relative flex min-w-0 flex-1 items-center py-4">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, Math.floor(videoDuration))}
                      step={1}
                      value={Math.min(Math.floor(ssTime), Math.floor(videoDuration))}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        setSsTime(t);
                        if (playerCtlRef.current?.seekAndPlay(t)) setSsActive(true);
                      }}
                      disabled={!videoDuration}
                      aria-label="Položaj v skladbi"
                      className="h-2 w-full min-w-0 cursor-pointer accent-orange-400 disabled:opacity-40"
                    />
                    {ssMarkerItems.map((m, k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => ssSeekToTime(Math.max(0, m.t - markerLead))}
                        title={`${m.label} · ${fmtClock(m.t)}`}
                        style={{ left: `${m.left}%` }}
                        className="absolute top-1/2 flex h-4 w-3 -translate-x-1/2 -translate-y-1/2 justify-center"
                      >
                        <span className="h-full w-px bg-(--cv-text) opacity-40" />
                        {m.row >= 0 && (
                          <span
                            className={`pointer-events-none absolute left-1/2 whitespace-nowrap text-[9px] leading-none text-(--cv-section) ${m.row === 0 ? "bottom-full mb-0.5" : "top-full mt-0.5"}`}
                          >
                            {m.short}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums opacity-70">{fmtClock(videoDuration)}</span>
                  <button
                    type="button"
                    onClick={() => setSsSeekOpen(false)}
                    aria-label="Zapri prevrtavanje"
                    title="Zapri"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-orange-400 opacity-80 hover:opacity-100"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {/* Odmik od robov (tudi izrez/zaobljeni robovi telefona v ležečem načinu). */}
              <div
                ref={ssBoxRef}
                className="min-h-0 flex-1 touch-none overflow-hidden"
                style={{
                  paddingTop: "max(1.75rem, env(safe-area-inset-top))",
                  // Zaprta stranska vrstica: besedilo dobi njen prostor (do gumba
                  // Meni, ki plava v kotu); ResizeObserver pisavo prilagodi.
                  paddingRight: ssSidebarOpen
                    ? "calc(max(0.75rem, env(safe-area-inset-right)) + var(--ss-btn) + 0.875rem)"
                    : "calc(max(0.75rem, env(safe-area-inset-right)) + 0.5rem)",
                  paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                  // Pokončno (telefon): besedilo bolj levo, da ozek zaslon dobi več širine.
                  paddingLeft: portrait ? "max(0.9rem, calc(env(safe-area-inset-left) + 0.5rem))" : "max(2.5rem, calc(env(safe-area-inset-left) + 1.25rem), 3vw)",
                }}
              >
                {/* relative: offsetTop vrstic je glede na ta blok; spodnji odmik, da se tudi
                    zadnje vrstice lahko pomaknejo v 2. vrstico. */}
                <div ref={ssLinesRef} className="relative w-max font-mono leading-snug will-change-transform" style={{ fontSize: 20 }}>
                  {ssLines.map(({ l, i, label }) => (
                    <div key={i}>
                    {label && (
                      <div className="font-sans font-semibold text-(--cv-section)" style={{ fontSize: "0.75em", marginTop: "0.9em" }}>
                        {label}
                      </div>
                    )}
                    <div
                      data-ss-line
                      // Večji odmik oranžne črte od besedila kot v navadnem Smart playu (v em — velika pisava).
                      style={SS_LINE_INSET}
                      onClick={(e) => !follower && ssSeekToLine(i, e)}
                      className={
                        i === ssHlLine
                          ? "-mr-1 rounded-r-md bg-[color-mix(in_srgb,var(--cv-text)_8%,transparent)] pr-1 shadow-[inset_2px_0_0_var(--cv-line)]"
                          : "-mr-1 pr-1"
                      }
                    >
                      {renderLine(l, i, true)}
                    </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center text-(--cv-text)">
              {/* Začetni zaslon Sam Špili: isto ozadje kot med igranjem (barva, preliv in
                  vzorec izbranega ozadja riše ovoj Sam Špili); tu samo blag sij v sredini. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(255,255,255,0.04),transparent_70%)]" />
              {/* Desno zgoraj, kot med predvajanjem: ✕, pod njim Meni (odpre meni ⚙ z
                  nastavitvami in predefiniranimi temami) in celozaslonsko. */}
              <div
                style={{ top: "max(0.75rem, env(safe-area-inset-top))", right: "max(0.75rem, env(safe-area-inset-right))" }}
                className="absolute z-10 flex flex-col gap-2"
              >
                <button type="button" onClick={onClose} aria-label="Zapri" title="Zapri" className="flex h-9 w-9 lg:h-12 lg:w-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 lg:h-5 lg:w-5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
                <button
                  ref={ssStartMenuRef}
                  type="button"
                  onClick={toggleSsStartMenu}
                  aria-label="Meni"
                  title="Meni (nastavitve in teme)"
                  aria-expanded={themeMenuPos !== null}
                  className={`flex h-9 w-9 lg:h-12 lg:w-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 ${themeMenuPos ? "bg-[color-mix(in_srgb,var(--cv-text)_18%,transparent)]" : "bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"}`}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 lg:h-5 lg:w-5">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                {!ssIsFullscreen && (
                  <button
                    type="button"
                    onClick={follower ? ssFollowerFullscreen : enterLandscapeFullscreen}
                    aria-label="Celozaslonsko"
                    title={follower ? "Celozaslonsko" : "Celozaslonsko (ležeče)"}
                    className="flex h-9 w-9 lg:h-12 lg:w-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_16%,transparent)] text-(--cv-text) shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition active:scale-95 bg-[color-mix(in_srgb,var(--cv-bg)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)]"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 lg:h-5 lg:w-5">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                  </button>
                )}
              </div>
              <div>
                <p className="text-4xl font-light leading-tight tracking-tight sm:text-6xl">{song.title}</p>
                <p className="mt-2 text-xl font-light text-(--cv-muted) sm:text-3xl">{song.author}</p>
              </div>
              {follower ? (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-base text-(--cv-muted)">Čakaš, da {follower.leaderName} zažene skladbo …</p>
                  {!ssIsFullscreen && canBrowserFullscreen() && (
                    <button
                      type="button"
                      onClick={ssFollowerFullscreen}
                      className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white backdrop-blur-xl transition hover:bg-white/[0.12] active:scale-95"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                      </svg>
                      Celozaslonsko
                    </button>
                  )}
                </div>
              ) : (
              <button
                type="button"
                onClick={ssPlay}
                disabled={ssRequested}
                aria-label="Predvajaj"
                title="Predvajaj"
                className="group relative flex h-24 w-24 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--cv-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--cv-text)_6%,transparent)] text-(--cv-text) shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition hover:scale-105 hover:border-[color-mix(in_srgb,var(--cv-text)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--cv-text)_10%,transparent)] active:scale-95 disabled:opacity-70 sm:h-28 sm:w-28"
              >
                {/* Nežen obroč okrog gumba */}
                <span aria-hidden="true" className="pointer-events-none absolute -inset-3 rounded-full border border-white/[0.06] transition group-hover:-inset-4 group-hover:border-white/10" />
                {ssRequested ? (
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="ml-1.5 h-10 w-10 sm:h-11 sm:w-11">
                    <path d="M7 4.5v15l12.5-7.5L7 4.5z" />
                  </svg>
                )}
              </button>
              )}
              {!smartAvailable && (
                <p className="text-sm text-(--cv-muted)">Za to skladbo še ni besedila s časi — Smart play ne bo sledil petju.</p>
              )}
              <p className="hidden text-sm text-(--cv-muted) portrait:block">Za večje vrstice obrni telefon v ležeči položaj.</p>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
