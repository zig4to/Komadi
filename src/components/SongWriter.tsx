"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ChordDiagram from "@/components/ChordDiagram";
import { CLOSE_BUTTON, CLOSE_ICON } from "@/components/Scales";
import { findChordShapes, loadChordDb, type ChordPosition } from "@/lib/chordShapes";
import { parseChords, splitDescription } from "@/lib/chords";
import { DEFAULT_MOODS, LIBRARY_OWNER_ID } from "@/lib/constants";
import {
  PROGRESSIONS,
  SECTION_TYPES,
  STEPS,
  STRUCTURES,
  TIPS,
  copySection,
  diatonicChords,
  emptyLine,
  instrLine,
  keyLabel,
  newSection,
  progressionChords,
  sectionHasContent,
  sectionInfo,
  sectionLabels,
  sectionTimeline,
  sectionsFromStructure,
  toUgText,
  usedChords,
  wordsOf,
  type OwnChord,
  type OwnLine,
  type OwnMemo,
  type OwnSection,
  type OwnSong,
  type SectionType,
  type StepId,
} from "@/lib/ownSongs";
import { NAMES } from "@/lib/scales";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { rebaseSyncOnEdit } from "@/lib/syncedLyrics";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { useMetronome } from "@/lib/useMetronome";
import { useAudio, useTicker, type AudioApi } from "@/lib/useStrumAudio";

// "Pišem" — vodič in urejevalnik za lastne skladbe benda (own_songs, skupne vsem
// prijavljenim). Seznam skladb → skladba v korakih (Ideja, Tonaliteta, Zgradba,
// Akordi in besedilo, Posnetki, Pregled); shranjuje se samodejno, spremembe drugih
// pridejo prek realtime. "Prestavi v knjižnico" naredi iz nje navadno skladbo
// (review_pending) z UG zapisom (toUgText).

type ChordDb = Awaited<ReturnType<typeof loadChordDb>>;

const OPEN_KEY = "komadi:writer:song";
const STEP_KEY = "komadi:writer:step";
const MODE_KEY = "komadi:writer:mode";
const TIPS_KEY = "komadi:writer:tips";
const SAVE_DELAY_MS = 900;
const UNDO_MAX = 60;

const CHIP = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition";
const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white dark:border-white/20 dark:bg-white/[0.14] dark:text-white";
const CHIP_OFF =
  "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.06]";
const LABEL = "mb-1.5 text-[11px] uppercase tracking-[0.06em] text-neutral-500";
const CARD = "rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.03]";
const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[0.06]";
const BTN_SM =
  "inline-flex items-center justify-center gap-1 rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[0.06]";
const BTN_MAIN =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50";
const INPUT =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-white/15 dark:bg-white/[0.04]";

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
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* zasebno okno */
  }
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "pravkar";
  if (s < 3600) return `pred ${Math.floor(s / 60)} min`;
  if (s < 86400) return `pred ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "včeraj" : `pred ${d} dnevi`;
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Vrstice iz baze (sections je jsonb — lahko manjka ali je starejše oblike).
function normalize(row: Partial<OwnSong> & { id: string }): OwnSong {
  return {
    title: "",
    idea: "",
    mood: null,
    key_tonic: 0,
    key_minor: false,
    bpm: 100,
    created_by: "",
    created_by_name: null,
    updated_by_name: null,
    library_song_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...row,
    sections: Array.isArray(row.sections) ? row.sections : [],
  };
}

// ---------- Predvajanje (brenkanje akordov v tempu) ----------

type PlayEvent = { half: number; name: string; lineId: string | null };
type Play = { id: string; events: PlayEvent[]; halves: number };
// Udarci v taktu (pol-dobe): D · D U · U D U
const STRUM_HITS = [0, 2, 3, 5, 6, 7];
const UP_HITS = new Set([3, 5, 7]);

function sectionEvents(section: OwnSection, offset = 0): { events: PlayEvent[]; halves: number } {
  const t = sectionTimeline(section.lines);
  return {
    events: t.events.map((e) => ({ half: e.half + offset, name: e.name, lineId: section.lines[e.line]?.id ?? null })),
    halves: t.halves,
  };
}

// ---------- Glavna komponenta ----------

export default function SongWriter({
  userName,
  onCountChange,
  onClose,
}: {
  userName: string;
  onCountChange: (n: number) => void;
  onClose: () => void;
}) {
  const [songs, setSongs] = useState<OwnSong[]>([]);
  const [memos, setMemos] = useState<OwnMemo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenIdState] = useState<string | null>(() => readJson<string | null>(OPEN_KEY, null));
  const setOpenId = (id: string | null) => {
    setOpenIdState(id);
    writeJson(OPEN_KEY, id);
  };
  const closeSong = () => setOpenId(null);
  useBackableOpen(true, onClose);
  useBackableOpen(openId !== null, closeSong);

  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const timers = useRef(new Map<string, number>());
  const dirty = useRef(new Map<string, Partial<OwnSong>>());
  const userNameRef = useRef(userName);
  useEffect(() => {
    userNameRef.current = userName;
  });

  const [db, setDb] = useState<ChordDb | null>(null);
  const audio = useAudio();

  useEffect(() => {
    let alive = true;
    loadChordDb()
      .then((d) => alive && setDb(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    Promise.all([
      supabase.from("own_songs").select("*").order("updated_at", { ascending: false }),
      supabase.from("own_song_memos").select("*").order("created_at", { ascending: true }),
    ]).then(([s, m]) => {
      if (!alive) return;
      if (s.error) setLoadError(s.error.message);
      setSongs(((s.data ?? []) as OwnSong[]).map(normalize));
      setMemos((m.data ?? []) as OwnMemo[]);
      setLoaded(true);
    });
    const channel = supabase
      .channel("own-songs")
      .on("postgres_changes", { event: "*", schema: "public", table: "own_songs" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) setSongs((prev) => prev.filter((s) => s.id !== id));
          return;
        }
        const row = payload.new as OwnSong;
        // Neshranjene lastne spremembe imajo prednost (sicer bi odmev starejšega
        // zapisa povozil, kar se tipka).
        if (dirty.current.has(row.id)) return;
        setSongs((prev) => {
          const i = prev.findIndex((s) => s.id === row.id);
          // Realtime ne pošlje nespremenjenih velikih (TOAST) stolpcev — vedno združi.
          if (i < 0) return [normalize(row), ...prev];
          const next = [...prev];
          next[i] = normalize({ ...prev[i], ...row });
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "own_song_memos" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) setMemos((prev) => prev.filter((m) => m.id !== id));
          return;
        }
        const row = payload.new as OwnMemo;
        setMemos((prev) => (prev.some((m) => m.id === row.id) ? prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)) : [...prev, row]));
      })
      .subscribe();
    const pendingTimers = timers.current;
    const pendingDirty = dirty.current;
    return () => {
      alive = false;
      supabase.removeChannel(channel);
      // Ob zapiranju shrani, kar še čaka.
      pendingTimers.forEach((t) => clearTimeout(t));
      pendingDirty.forEach((patch, id) => {
        void supabase
          .from("own_songs")
          .update({ ...patch, updated_by_name: userNameRef.current || null, updated_at: new Date().toISOString() })
          .eq("id", id);
      });
      pendingDirty.clear();
    };
  }, []);

  useEffect(() => {
    if (loaded) onCountChange(songs.length);
  }, [loaded, songs.length, onCountChange]);

  const flush = async (id: string) => {
    const patch = dirty.current.get(id);
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    if (!patch) return;
    dirty.current.delete(id);
    setSaveState("saving");
    const { error } = await supabase
      .from("own_songs")
      .update({ ...patch, updated_by_name: userName || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // Ponovno v čakanje, da se ob naslednji spremembi poskusi znova.
      dirty.current.set(id, { ...patch, ...(dirty.current.get(id) ?? {}) });
      setSaveState("error");
    } else setSaveState(dirty.current.size ? "dirty" : "saved");
  };

  const patchSong = (id: string, patch: Partial<OwnSong>) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, updated_by_name: userName || s.updated_by_name, updated_at: new Date().toISOString() } : s)));
    dirty.current.set(id, { ...(dirty.current.get(id) ?? {}), ...patch });
    setSaveState("dirty");
    clearTimeout(timers.current.get(id));
    timers.current.set(id, window.setTimeout(() => void flush(id), SAVE_DELAY_MS));
  };

  // Razveljavi: prejšnje stanje delov po skladbi; tipkanje v isto polje se
  // združi v en korak (1,5 s).
  const undo = useRef(new Map<string, OwnSection[][]>());
  const lastUndo = useRef<{ key: string; at: number } | null>(null);
  const [undoSizes, setUndoSizes] = useState<Record<string, number>>({});
  const setSections = (song: OwnSong, sections: OwnSection[], coalesce?: string) => {
    const now = new Date().getTime();
    const last = lastUndo.current;
    if (!(coalesce && last && last.key === `${song.id}:${coalesce}` && now - last.at < 1500)) {
      const stack = undo.current.get(song.id) ?? [];
      stack.push(song.sections);
      if (stack.length > UNDO_MAX) stack.shift();
      undo.current.set(song.id, stack);
      setUndoSizes((m) => ({ ...m, [song.id]: stack.length }));
    }
    lastUndo.current = coalesce ? { key: `${song.id}:${coalesce}`, at: now } : null;
    patchSong(song.id, { sections });
  };
  const undoSections = (song: OwnSong) => {
    const stack = undo.current.get(song.id);
    const prev = stack?.pop();
    if (!prev) return;
    lastUndo.current = null;
    setUndoSizes((m) => ({ ...m, [song.id]: stack?.length ?? 0 }));
    patchSong(song.id, { sections: prev });
  };
  const canUndo = (id: string) => (undoSizes[id] ?? 0) > 0;

  const createSong = async () => {
    const { data, error } = await supabase
      .from("own_songs")
      .insert({ title: "Nova skladba", created_by_name: userName || null, updated_by_name: userName || null })
      .select("*")
      .single();
    if (error || !data) {
      alert("Skladbe ni bilo mogoče ustvariti: " + (error?.message ?? ""));
      return;
    }
    const row = normalize(data as OwnSong);
    setSongs((prev) => (prev.some((s) => s.id === row.id) ? prev : [row, ...prev]));
    setStep("idea");
    setOpenId(row.id);
  };

  const deleteSong = async (song: OwnSong) => {
    if (!confirm(`Izbrišem »${song.title || "brez naslova"}« za vse? Posnetki se izbrišejo tudi.`)) return;
    const paths = memos.filter((m) => m.own_song_id === song.id).map((m) => m.path);
    if (paths.length) await supabase.storage.from("song-memos").remove(paths);
    const { error } = await supabase.from("own_songs").delete().eq("id", song.id);
    if (error) {
      alert("Brisanje ni uspelo: " + error.message);
      return;
    }
    dirty.current.delete(song.id);
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    if (openId === song.id) setOpenId(null);
  };

  const [step, setStepState] = useState<StepId>(() => {
    const s = readJson<string>(STEP_KEY, "idea");
    return STEPS.some((x) => x.id === s) ? (s as StepId) : "idea";
  });
  const setStep = (s: StepId) => {
    setStepState(s);
    writeJson(STEP_KEY, s);
  };

  // Predvajanje: en predvajalnik za vso stran (kadenca, del, cela pesem).
  const [play, setPlay] = useState<Play | null>(null);
  const playRef = useRef<Play | null>(null);
  const stopTimer = useRef<number | null>(null);
  useEffect(() => {
    playRef.current = play;
  });
  const shapeOf = (name: string): ChordPosition | undefined => (db ? findChordShapes(db, name)[0] : undefined);
  const shapeRef = useRef(shapeOf);
  useEffect(() => {
    shapeRef.current = shapeOf;
  });
  const open = songs.find((s) => s.id === openId) ?? null;
  const bpm = open?.bpm ?? 100;
  const shown = useTicker(audio, play !== null, bpm, 2, (step, at) => {
    const p = playRef.current;
    if (!p) return;
    if (step === p.halves) {
      const c = audio.ctx();
      const delay = c ? Math.max(0, (at - c.currentTime) * 1000) : 0;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = window.setTimeout(() => setPlay(null), delay + 150);
      return;
    }
    if (step > p.halves) return;
    let cur: PlayEvent | null = null;
    for (const e of p.events) if (e.half <= step) cur = e;
    if (!cur) return;
    const pos = step % 8;
    const isNew = cur.half === step;
    if (!isNew && !STRUM_HITS.includes(pos)) return;
    const shape = shapeRef.current(cur.name);
    if (!shape) return;
    const nextHit = STRUM_HITS.find((h) => h > pos) ?? 8;
    const ring = ((nextHit - pos) * 60) / Math.max(20, bpm) / 2;
    audio.strum(at, shape, !isNew && UP_HITS.has(pos), 0.22, ring);
  });
  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
    },
    [],
  );
  const startPlay = (p: Play) => {
    if (play) {
      setPlay(null);
      return;
    }
    if (!audio.ctx()) return;
    if (!p.events.length) return;
    setPlay(p);
  };
  const playLineId = (() => {
    if (!play || shown < 0) return null;
    let cur: PlayEvent | null = null;
    for (const e of play.events) if (e.half <= shown) cur = e;
    return cur?.lineId ?? null;
  })();
  const strumOnce = (name: string) => {
    const c = audio.ctx();
    const shape = shapeOf(name);
    if (c && shape) audio.strum(c.currentTime + 0.02, shape, false, 0.22, 1.4);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openId) setOpenId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (typeof document === "undefined") return null;

  const saveLabel =
    saveState === "saving" ? "Shranjujem …" : saveState === "dirty" ? "Shranjujem …" : saveState === "error" ? "Napaka pri shranjevanju" : "Shranjeno";

  return createPortal(
    <div
      data-view-portal
      className="fixed inset-0 z-50 flex flex-col bg-white text-neutral-900 [--cv-bg:#ffffff] [--cv-chord:#c2410c] [--cv-muted:#a3a3a3] [--cv-text:#262626] dark:bg-[#0d0d10] dark:text-neutral-100 dark:[--cv-bg:#0d0d10] dark:[--cv-chord:#fb923c] dark:[--cv-muted:#525252] dark:[--cv-text:#e5e5e5]"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
        {open ? (
          <button type="button" onClick={closeSong} className={BTN_SM} title="Nazaj na seznam">
            ‹ Seznam
          </button>
        ) : (
          <PenIcon className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{open ? open.title || "Brez naslova" : "Pišem — lastne skladbe"}</h2>
        {open && (
          <span className={`hidden text-xs sm:inline ${saveState === "error" ? "text-red-500" : "text-neutral-500"}`}>{saveLabel}</span>
        )}
        <button type="button" onClick={onClose} aria-label="Zapri" title="Zapri" className={CLOSE_BUTTON}>
          {CLOSE_ICON}
        </button>
      </div>

      {open ? (
        <SongEditor
          key={open.id}
          song={open}
          memos={memos.filter((m) => m.own_song_id === open.id)}
          setMemos={setMemos}
          userName={userName}
          step={step}
          setStep={setStep}
          patch={(p) => patchSong(open.id, p)}
          setSections={(s, c) => setSections(open, s, c)}
          undo={() => undoSections(open)}
          canUndo={canUndo(open.id)}
          saveLabel={saveLabel}
          saveError={saveState === "error"}
          flush={() => flush(open.id)}
          db={db}
          shapeOf={shapeOf}
          strumOnce={strumOnce}
          audio={audio}
          play={play}
          startPlay={startPlay}
          playLineId={playLineId}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void createSong()} className={BTN_MAIN} disabled={!loaded}>
                + Nova skladba
              </button>
              <p className="text-sm text-neutral-500">Skladbe so skupne — vidi in ureja jih ves bend.</p>
            </div>
            {!loaded && !loadError && <p className="text-sm text-neutral-500">Nalagam …</p>}
            {loadError && <p className="text-sm text-red-500">Napaka: {loadError}</p>}
            {loaded && !songs.length && (
              <div className={`${CARD} text-sm text-neutral-600 dark:text-neutral-300`}>
                Še nobene lastne skladbe. Klikni »+ Nova skladba« — vodič te popelje od ideje, tonalitete in zgradbe do akordov nad besedilom in
                glasovnih posnetkov melodije.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {songs.map((s) => {
                const memoCount = memos.filter((m) => m.own_song_id === s.id).length;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setOpenId(s.id);
                    }}
                    className={`${CARD} cursor-pointer transition hover:border-amber-400 dark:hover:border-amber-500/50`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{s.title || "Brez naslova"}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {keyLabel(s.key_tonic, s.key_minor)} · {s.bpm} BPM · {s.sections.length} {s.sections.length === 1 ? "del" : "delov"}
                          {memoCount ? ` · ${memoCount} posn.` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteSong(s);
                        }}
                        className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-white/[0.06]"
                        aria-label="Izbriši"
                        title="Izbriši"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                    {s.idea && <p className="mt-2 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{s.idea}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {s.library_song_id && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          v knjižnici
                        </span>
                      )}
                      <span>
                        {s.created_by_name ? `${s.created_by_name}` : ""}
                        {s.updated_by_name && s.updated_by_name !== s.created_by_name ? ` · urejal ${s.updated_by_name}` : ""} · {ago(s.updated_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9" />
      <path d="M16.38 3.62a2.12 2.12 0 0 1 3 3L7.37 18.63 3 20l1.37-4.37z" />
    </svg>
  );
}

// ---------- Urejevalnik ene skladbe ----------

type EditorProps = {
  song: OwnSong;
  memos: OwnMemo[];
  setMemos: React.Dispatch<React.SetStateAction<OwnMemo[]>>;
  userName: string;
  step: StepId;
  setStep: (s: StepId) => void;
  patch: (p: Partial<OwnSong>) => void;
  setSections: (s: OwnSection[], coalesce?: string) => void;
  undo: () => void;
  canUndo: boolean;
  saveLabel: string;
  saveError: boolean;
  flush: () => Promise<void>;
  db: ChordDb | null;
  shapeOf: (name: string) => ChordPosition | undefined;
  strumOnce: (name: string) => void;
  audio: AudioApi;
  play: Play | null;
  startPlay: (p: Play) => void;
  playLineId: string | null;
};

function SongEditor(props: EditorProps) {
  const { song, step, setStep, saveLabel, saveError } = props;
  const idx = STEPS.findIndex((s) => s.id === step);
  const [tipsOpen, setTipsOpen] = useState(() => readJson<boolean>(TIPS_KEY, true));
  const toggleTips = () => {
    setTipsOpen((v) => {
      writeJson(TIPS_KEY, !v);
      return !v;
    });
  };
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-200 px-4 py-2.5 [scrollbar-width:thin] dark:border-white/[0.08]">
        {STEPS.map((s, i) => (
          <button key={s.id} type="button" onClick={() => setStep(s.id)} aria-pressed={step === s.id} className={`${CHIP} ${step === s.id ? CHIP_ON : CHIP_OFF}`}>
            <span className="mr-1 opacity-60">{i + 1}.</span>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="mb-3 flex items-center gap-2 sm:hidden">
            <span className={`text-xs ${saveError ? "text-red-500" : "text-neutral-500"}`}>{saveLabel}</span>
          </div>
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
            <button type="button" onClick={toggleTips} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-amber-800 dark:text-amber-300">
              <span>💡 Nasveti: {STEPS[idx].label}</span>
              <span className="ml-auto text-xs">{tipsOpen ? "▲" : "▼"}</span>
            </button>
            {tipsOpen && (
              <ul className="list-disc space-y-1 px-3 pb-3 pl-8 text-sm text-amber-900/90 dark:text-amber-100/80">
                {TIPS[step].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          {step === "idea" && <IdeaStep {...props} />}
          {step === "key" && <KeyStep {...props} />}
          {step === "structure" && <StructureStep {...props} />}
          {step === "write" && <WriteStep {...props} />}
          {step === "memos" && <MemosStep {...props} />}
          {step === "preview" && <PreviewStep {...props} />}

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-neutral-200 pt-4 dark:border-white/[0.08]">
            <button type="button" className={BTN} disabled={idx <= 0} onClick={() => setStep(STEPS[idx - 1].id)}>
              ‹ Nazaj
            </button>
            <span className="text-xs text-neutral-500">
              Korak {idx + 1} / {STEPS.length}
            </span>
            <button type="button" className={BTN} disabled={idx >= STEPS.length - 1} onClick={() => setStep(STEPS[idx + 1].id)}>
              Naprej ›
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-neutral-500">
            {song.created_by_name ? `Začel: ${song.created_by_name}` : ""}
            {song.updated_by_name ? ` · zadnji urejal: ${song.updated_by_name}, ${ago(song.updated_at)}` : ""}
          </p>
        </div>
      </div>
    </>
  );
}

// ---------- 1. Ideja ----------

function IdeaStep({ song, patch }: EditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className={LABEL}>Naslov</div>
        <input className={INPUT} value={song.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Delovni naslov" />
      </div>
      <div>
        <div className={LABEL}>O čem govori</div>
        <textarea
          className={`${INPUT} min-h-32`}
          value={song.idea}
          onChange={(e) => patch({ idea: e.target.value })}
          placeholder="Zgodba, občutek, slike, ki jih želiš pokazati … in vse zapiske, ki ti pridejo na misel."
        />
      </div>
      <div>
        <div className={LABEL}>Razpoloženje</div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_MOODS.map((m) => (
            <button key={m} type="button" onClick={() => patch({ mood: song.mood === m ? null : m })} className={`${CHIP} ${song.mood === m ? CHIP_ON : CHIP_OFF}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 2. Tonaliteta in tempo ----------

function KeyStep({ song, patch, strumOnce, play, startPlay }: EditorProps) {
  const [metroOn, setMetroOn] = useState(false);
  const metro = useMetronome(song.bpm, metroOn);
  const chords = diatonicChords(song.key_tonic, song.key_minor);
  const cadence = song.key_minor ? [chords[0].name, chords[3].name, chords[7].name, chords[0].name] : [chords[0].name, chords[3].name, chords[4].name, chords[0].name];
  const setBpm = (b: number) => patch({ bpm: Math.max(40, Math.min(220, b)) });
  return (
    <div className="space-y-5">
      <div>
        <div className={LABEL}>Tonika</div>
        <div className="flex flex-wrap gap-1.5">
          {NAMES.map((n, i) => (
            <button key={n} type="button" onClick={() => patch({ key_tonic: i })} className={`${CHIP} min-w-11 ${song.key_tonic === i ? CHIP_ON : CHIP_OFF}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => patch({ key_minor: false })} className={`${CHIP} ${!song.key_minor ? CHIP_ON : CHIP_OFF}`}>
          Dur
        </button>
        <button type="button" onClick={() => patch({ key_minor: true })} className={`${CHIP} ${song.key_minor ? CHIP_ON : CHIP_OFF}`}>
          Mol
        </button>
        <span className="ml-2 text-sm font-semibold">{keyLabel(song.key_tonic, song.key_minor)}</span>
        <button
          type="button"
          className={`${BTN} ml-auto`}
          onClick={() => startPlay({ id: "cadence", events: cadence.map((name, i) => ({ half: i * 8, name, lineId: null })), halves: cadence.length * 8 })}
        >
          {play?.id === "cadence" ? "■ Ustavi" : "▶ Zaigraj kadenco"}
        </button>
      </div>
      <div>
        <div className={LABEL}>Akordi tonalitete — tapni za zvok</div>
        <div className="flex flex-wrap gap-2">
          {chords.map((c) => (
            <button
              key={c.roman + c.name}
              type="button"
              onClick={() => strumOnce(c.name)}
              className={`flex min-w-14 flex-col items-center rounded-xl border px-3 py-1.5 transition hover:bg-neutral-100 dark:hover:bg-white/[0.06] ${
                c.extra ? "border-dashed border-neutral-300 dark:border-white/15" : "border-neutral-200 dark:border-white/[0.1]"
              }`}
            >
              <span className="text-[10px] text-neutral-500">{c.roman}</span>
              <span className="font-semibold text-[var(--cv-chord)]">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">
          Velike rimske številke so durovi akordi, male molovi. Črtkani je »dodaten« akord, ki se pogosto sliši v tej tonaliteti.
        </p>
      </div>
      <div>
        <div className={LABEL}>Tempo</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_SM} onClick={() => setBpm(song.bpm - 5)}>
            −5
          </button>
          <button type="button" className={BTN_SM} onClick={() => setBpm(song.bpm - 1)}>
            −1
          </button>
          <span className="w-20 text-center text-lg font-semibold tabular-nums">{song.bpm} BPM</span>
          <button type="button" className={BTN_SM} onClick={() => setBpm(song.bpm + 1)}>
            +1
          </button>
          <button type="button" className={BTN_SM} onClick={() => setBpm(song.bpm + 5)}>
            +5
          </button>
          <button
            type="button"
            className={`${BTN} ml-2`}
            onClick={() => {
              metro.prime();
              setMetroOn((v) => !v);
            }}
          >
            {metroOn ? "■ Ustavi metronom" : "▶ Metronom"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 3. Zgradba ----------

function StructureStep({ song, setSections }: EditorProps) {
  const labels = sectionLabels(song.sections);
  const secs = song.sections;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= secs.length) return;
    const next = [...secs];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  };
  const applyTemplate = (types: SectionType[]) => {
    if (secs.some(sectionHasContent) && !confirm("Zamenjam trenutno zgradbo s predlogo? Besedilo in akordi obstoječih delov se izgubijo (lahko razveljaviš).")) return;
    setSections(sectionsFromStructure(types));
  };
  const fillRepeats = () => {
    const firstOf = new Map<SectionType, OwnSection>();
    let changed = 0;
    const next = secs.map((s) => {
      if (s.type !== "chorus" && s.type !== "prechorus") return s;
      const src = firstOf.get(s.type);
      if (!src) {
        if (sectionHasContent(s)) firstOf.set(s.type, s);
        return s;
      }
      if (sectionHasContent(s)) return s;
      changed++;
      return { ...copySection(src), id: s.id };
    });
    if (changed) setSections(next);
    else alert("Ni praznih ponovitev refrena (ali prvi refren še ni napisan).");
  };
  return (
    <div className="space-y-5">
      <div>
        <div className={LABEL}>Predloge</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {STRUCTURES.map((t) => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t.types)} className={`${CARD} text-left transition hover:border-amber-400`}>
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-neutral-500">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className={LABEL}>Deli pesmi</div>
        {!secs.length && <p className="text-sm text-neutral-500">Izberi predlogo zgoraj ali dodaj dele enega po enega.</p>}
        <div className="space-y-1.5">
          {secs.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 px-2 py-1.5 dark:border-white/[0.08]">
              <span className="w-28 text-sm font-semibold">{labels[i].sl}</span>
              <select
                value={s.type}
                onChange={(e) => {
                  const type = e.target.value as SectionType;
                  const instr = !!sectionInfo(type).instrumental;
                  setSections(
                    secs.map((x) =>
                      x.id !== s.id ? x : { ...x, type, lines: x.lines.length ? x.lines : instr ? [instrLine()] : [emptyLine(), emptyLine(), emptyLine(), emptyLine()] },
                    ),
                  );
                }}
                className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-white/15"
              >
                {SECTION_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.sl}
                  </option>
                ))}
              </select>
              <span className="flex-1 truncate text-xs text-neutral-500">{s.lines.find((l) => l.text.trim())?.text ?? ""}</span>
              <button type="button" className={BTN_SM} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Gor">
                ↑
              </button>
              <button type="button" className={BTN_SM} onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label="Dol">
                ↓
              </button>
              <button type="button" className={BTN_SM} onClick={() => setSections([...secs.slice(0, i + 1), copySection(s), ...secs.slice(i + 1)])}>
                Podvoji
              </button>
              <button
                type="button"
                className={`${BTN_SM} hover:text-red-500`}
                onClick={() => {
                  if (sectionHasContent(s) && !confirm(`Izbrišem ${labels[i].sl}?`)) return;
                  setSections(secs.filter((x) => x.id !== s.id));
                }}
                aria-label="Izbriši"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SECTION_TYPES.map((t) => (
            <button key={t.type} type="button" className={`${CHIP} ${CHIP_OFF}`} onClick={() => setSections([...secs, newSection(t.type)])}>
              + {t.sl}
            </button>
          ))}
        </div>
        {secs.length > 0 && (
          <button type="button" className={`${BTN} mt-3`} onClick={fillRepeats}>
            Napolni prazne ponovitve refrena
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- 4. Akordi in besedilo ----------

function WriteStep(props: EditorProps) {
  const { song, setSections, undo, canUndo, shapeOf, strumOnce, play, startPlay, playLineId } = props;
  const [mode, setModeState] = useState<"text" | "chords">(() => (readJson<string>(MODE_KEY, "text") === "chords" ? "chords" : "text"));
  const setMode = (m: "text" | "chords") => {
    setModeState(m);
    writeJson(MODE_KEY, m);
  };
  const diatonic = diatonicChords(song.key_tonic, song.key_minor);
  const used = usedChords(song.sections).filter((n) => !diatonic.some((d) => d.name === n));
  const [brush, setBrush] = useState<string | null>(() => diatonic[0]?.name ?? null);
  const [custom, setCustom] = useState("");
  const labels = sectionLabels(song.sections);
  const brushShape = brush ? shapeOf(brush) : undefined;

  const updateSection = (id: string, lines: OwnLine[], coalesce?: string) =>
    setSections(
      song.sections.map((s) => (s.id === id ? { ...s, lines } : s)),
      coalesce,
    );

  const pickBrush = (name: string) => {
    setBrush(name);
    strumOnce(name);
  };

  const playAll = () => {
    const events: PlayEvent[] = [];
    let off = 0;
    for (const s of song.sections) {
      const t = sectionEvents(s, off);
      events.push(...t.events);
      off += t.halves;
    }
    startPlay({ id: "all", events, halves: off });
  };

  if (!song.sections.length)
    return <p className="text-sm text-neutral-500">Najprej v koraku »Zgradba« izberi predlogo ali dodaj dele pesmi.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setMode("text")} className={`${CHIP} ${mode === "text" ? CHIP_ON : CHIP_OFF}`}>
          ✎ Besedilo
        </button>
        <button type="button" onClick={() => setMode("chords")} className={`${CHIP} ${mode === "chords" ? CHIP_ON : CHIP_OFF}`}>
          ♪ Akordi
        </button>
        <button type="button" className={`${BTN_SM} ml-auto`} onClick={undo} disabled={!canUndo}>
          ↶ Razveljavi
        </button>
        <button type="button" className={BTN_SM} onClick={playAll}>
          {play?.id === "all" ? "■ Ustavi" : "▶ Cela pesem"}
        </button>
      </div>

      {mode === "chords" && (
        <div className="sticky -top-4 z-10 -mx-4 border-b border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-white/[0.08] dark:bg-[#0d0d10]/95">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className={LABEL}>Izberi akord, nato tapni besedo</div>
              <div className="flex flex-wrap gap-1.5">
                {diatonic.map((c) => (
                  <button
                    key={c.roman + c.name}
                    type="button"
                    onClick={() => pickBrush(c.name)}
                    className={`${CHIP} ${brush === c.name ? "border-amber-500 bg-amber-500 text-white" : CHIP_OFF}`}
                    title={c.roman}
                  >
                    <span className="mr-1 text-[10px] opacity-70">{c.roman}</span>
                    {c.name}
                  </button>
                ))}
                {used.map((n) => (
                  <button key={n} type="button" onClick={() => pickBrush(n)} className={`${CHIP} ${brush === n ? "border-amber-500 bg-amber-500 text-white" : CHIP_OFF}`}>
                    {n}
                  </button>
                ))}
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = custom.trim();
                    if (!n) return;
                    pickBrush(n);
                    setCustom("");
                  }}
                >
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Drug akord"
                    className="w-24 rounded-full border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-white/15"
                  />
                  <button type="submit" className={BTN_SM}>
                    OK
                  </button>
                </form>
              </div>
            </div>
            {brush && brushShape && (
              <div className="hidden w-24 shrink-0 sm:block">
                <ChordDiagram name={brush} position={brushShape} />
              </div>
            )}
          </div>
        </div>
      )}

      {song.sections.map((s, si) => (
        <SectionCard
          key={s.id}
          section={s}
          label={labels[si].sl}
          song={song}
          mode={mode}
          brush={brush}
          sourceFor={
            !sectionHasContent(s)
              ? (() => {
                  const k = song.sections.findIndex((x, xi) => xi < si && x.type === s.type && sectionHasContent(x));
                  return k >= 0 ? { section: song.sections[k], label: labels[k].sl } : null;
                })()
              : null
          }
          updateLines={(lines, c) => updateSection(s.id, lines, c)}
          play={play}
          startPlay={startPlay}
          playLineId={playLineId}
        />
      ))}
    </div>
  );
}

function SectionCard({
  section,
  label,
  song,
  mode,
  brush,
  sourceFor,
  updateLines,
  play,
  startPlay,
  playLineId,
}: {
  section: OwnSection;
  label: string;
  song: OwnSong;
  mode: "text" | "chords";
  brush: string | null;
  sourceFor: { section: OwnSection; label: string } | null;
  updateLines: (lines: OwnLine[], coalesce?: string) => void;
  play: Play | null;
  startPlay: (p: Play) => void;
  playLineId: string | null;
}) {
  const info = sectionInfo(section.type);
  const lyricLines = section.lines.filter((l) => !l.instr);
  const instrLines = section.lines.filter((l) => l.instr);
  const progs = PROGRESSIONS.filter((p) => p.minor === song.key_minor);
  const [progId, setProgId] = useState(progs[0]?.id ?? "");
  const [perLine, setPerLine] = useState<1 | 2>(1);

  const onText = (value: string) => {
    const parts = value.split("\n");
    const lines: OwnLine[] = parts.map((text, i) => {
      const old = lyricLines[i];
      return old ? { ...old, text } : { ...emptyLine(), text };
    });
    updateLines([...lines, ...instrLines], "text:" + section.id);
  };

  const setLine = (id: string, chords: OwnChord[]) => updateLines(section.lines.map((l) => (l.id === id ? { ...l, chords } : l)));

  const applyProgression = () => {
    const p = PROGRESSIONS.find((x) => x.id === progId);
    if (!p) return;
    const names = progressionChords(song.key_tonic, p);
    const hasLyrics = lyricLines.some((l) => l.text.trim());
    if (info.instrumental || !hasLyrics) {
      const rest = section.lines.filter((l) => !l.instr && l.text.trim());
      updateLines([...rest, { ...instrLine(), chords: names.map((name, i) => ({ at: i, name })) }]);
      return;
    }
    let k = 0;
    updateLines(
      section.lines.map((l) => {
        if (l.instr || !l.text.trim()) return l;
        const chords: OwnChord[] = [{ at: 0, name: names[k++ % names.length] }];
        if (perLine === 2) {
          const words = wordsOf(l.text);
          const mid = l.text.length / 2;
          const w = words.slice(1).reduce<{ start: number } | null>((best, x) => (!best || Math.abs(x.start - mid) < Math.abs(best.start - mid) ? x : best), null);
          if (w) chords.push({ at: w.start, name: names[k++ % names.length] });
        }
        return { ...l, chords };
      }),
    );
  };

  const playId = "sec:" + section.id;
  return (
    <div className={CARD}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{label}</span>
        {info.instrumental && <span className="text-xs text-neutral-500">instrumentalno</span>}
        <button
          type="button"
          className={`${BTN_SM} ml-auto`}
          onClick={() => {
            const t = sectionEvents(section);
            startPlay({ id: playId, events: t.events, halves: t.halves });
          }}
        >
          {play?.id === playId ? "■ Ustavi" : "▶ Zaigraj del"}
        </button>
      </div>

      {sourceFor && (
        <button
          type="button"
          className={`${BTN_SM} mb-2`}
          onClick={() => updateLines(copySection(sourceFor.section).lines)}
        >
          Kopiraj iz »{sourceFor.label}«
        </button>
      )}

      {mode === "text" && !info.instrumental && (
        <textarea
          className={`${INPUT} font-mono leading-relaxed`}
          rows={Math.max(4, lyricLines.length)}
          value={lyricLines.map((l) => l.text).join("\n")}
          onChange={(e) => onText(e.target.value)}
          placeholder="Vsaka vrstica besedila v svojo vrstico …"
        />
      )}

      {(mode === "chords" || info.instrumental) && (
        <div className="space-y-2">
          {!section.lines.some((l) => l.instr || l.text.trim() || l.chords.length) && (
            <p className="text-xs text-neutral-500">Najprej vpiši besedilo (✎ Besedilo), uporabi progresijo ali dodaj vrstico samih akordov.</p>
          )}
          {section.lines.filter((l) => l.instr || l.text.trim() || l.chords.length).map((l) => (
            <LineChords
              key={l.id}
              line={l}
              brush={brush}
              active={playLineId === l.id}
              setChords={(c) => setLine(l.id, c)}
              editable={mode === "chords" || info.instrumental === true}
            />
          ))}
          {mode === "chords" && (
            <button type="button" className={BTN_SM} onClick={() => updateLines([...section.lines, instrLine()])}>
              + Vrstica samih akordov
            </button>
          )}
        </div>
      )}

      {mode === "text" && !info.instrumental && instrLines.length > 0 && (
        <div className="mt-2 space-y-1">
          {instrLines.map((l) => (
            <LineChords key={l.id} line={l} brush={brush} active={playLineId === l.id} setChords={() => {}} editable={false} />
          ))}
        </div>
      )}

      {mode === "chords" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-neutral-200 pt-2 dark:border-white/[0.06]">
          <span className="text-xs text-neutral-500">Progresija:</span>
          <select
            value={progId}
            onChange={(e) => setProgId(e.target.value)}
            className="max-w-48 rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-white/15"
          >
            {progs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({progressionChords(song.key_tonic, p).join(" ")})
              </option>
            ))}
          </select>
          {!info.instrumental && (
            <select
              value={perLine}
              onChange={(e) => setPerLine(e.target.value === "2" ? 2 : 1)}
              className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-white/15"
            >
              <option value={1}>1 na vrstico</option>
              <option value={2}>2 na vrstico</option>
            </select>
          )}
          <button type="button" className={BTN_SM} onClick={applyProgression}>
            Uporabi
          </button>
          <span className="w-full text-[11px] text-neutral-500">{PROGRESSIONS.find((p) => p.id === progId)?.hint}</span>
        </div>
      )}
    </div>
  );
}

// Vrstica v načinu "Akordi": besede kot bloki z akordi nad začetkom. Tap besede
// postavi izbrani akord, tap akorda ga odstrani. Brez besedila = zaporedje akordov.
function LineChords({
  line,
  brush,
  active,
  setChords,
  editable,
}: {
  line: OwnLine;
  brush: string | null;
  active: boolean;
  setChords: (c: OwnChord[]) => void;
  editable: boolean;
}) {
  const ring = active ? "bg-amber-100/70 shadow-[inset_2px_0_0_#f59e0b] dark:bg-amber-500/10" : "";
  const remove = (c: OwnChord) => setChords(line.chords.filter((x) => x !== c));
  const chordBtn = (c: OwnChord, k: number) =>
    editable ? (
      <button
        key={k}
        type="button"
        onClick={() => remove(c)}
        className="rounded px-0.5 font-semibold text-[var(--cv-chord)] hover:line-through"
        title="Odstrani akord"
      >
        {c.name}
      </button>
    ) : (
      <span key={k} className="px-0.5 font-semibold text-[var(--cv-chord)]">
        {c.name}
      </span>
    );

  if (!line.text.trim()) {
    const sorted = [...line.chords].sort((a, b) => a.at - b.at);
    return (
      <div className={`-ml-2 flex flex-wrap items-center gap-2 rounded-lg py-1 pl-2 ${ring}`}>
        {sorted.length === 0 && <span className="text-xs text-neutral-400">{line.instr ? "vrstica samih akordov — dodaj z +" : "prazna vrstica"}</span>}
        {sorted.map((c, k) => (
          <span key={k} className="rounded-lg border border-neutral-200 px-2 py-0.5 dark:border-white/[0.1]">
            {chordBtn(c, k)}
          </span>
        ))}
        {editable && (
          <button
            type="button"
            disabled={!brush}
            onClick={() => brush && setChords([...line.chords, { at: (sorted.at(-1)?.at ?? -1) + 1, name: brush }])}
            className={BTN_SM}
          >
            + {brush ?? ""}
          </button>
        )}
      </div>
    );
  }

  const words = wordsOf(line.text);
  const sorted = [...line.chords].sort((a, b) => a.at - b.at);
  // Akord pripada besedi, v kateri (ali pred katero) stoji; za koncem = rep.
  const owner = (at: number) => {
    if (at >= line.text.length) return -1;
    let k = 0;
    for (let i = 0; i < words.length; i++) if (words[i].start <= at) k = i;
    return k;
  };
  const tail = sorted.filter((c) => owner(c.at) < 0);
  const tapWord = (start: number) => {
    if (!editable || !brush) return;
    const same = line.chords.find((c) => c.at === start);
    if (same && same.name === brush) {
      remove(same);
      return;
    }
    setChords([...line.chords.filter((c) => c.at !== start), { at: start, name: brush }]);
  };
  return (
    <div className={`-ml-2 flex flex-wrap items-end gap-x-1.5 gap-y-1 rounded-lg py-1 pl-2 ${ring}`}>
      {words.map((w, i) => {
        const mine = sorted.filter((c) => owner(c.at) === i);
        return (
          <div key={i} className="flex flex-col">
            <div className="flex min-h-5 gap-0.5 text-sm leading-5">{mine.map((c, k) => chordBtn(c, k))}</div>
            <button
              type="button"
              onClick={() => tapWord(w.start)}
              disabled={!editable}
              className={`rounded px-0.5 text-left text-[15px] leading-6 ${editable ? "hover:bg-amber-100 dark:hover:bg-amber-500/15" : ""}`}
            >
              {w.word}
            </button>
          </div>
        );
      })}
      {(tail.length > 0 || editable) && (
        <div className="flex flex-col">
          <div className="flex min-h-5 gap-0.5 text-sm leading-5">{tail.map((c, k) => chordBtn(c, k))}</div>
          {editable ? (
            <button
              type="button"
              disabled={!brush}
              onClick={() => brush && setChords([...line.chords, { at: Math.max(line.text.length + 1, (tail.at(-1)?.at ?? 0) + 1), name: brush }])}
              className="rounded px-1 text-left text-[15px] leading-6 text-neutral-400 hover:bg-amber-100 disabled:opacity-40 dark:hover:bg-amber-500/15"
              title="Akord na koncu vrstice"
            >
              +
            </button>
          ) : (
            <span className="leading-6">&nbsp;</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 5. Posnetki ----------

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function MemosStep({ song, memos, setMemos, userName }: EditorProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream; started: number; chunks: Blob[]; mime: string } | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const r = recRef.current;
      if (r) setElapsed((Date.now() - r.started) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(
    () => () => {
      const r = recRef.current;
      if (r) {
        r.rec.onstop = null;
        if (r.rec.state !== "inactive") r.rec.stop();
        r.stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
      }
    },
    [],
  );

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Ta brskalnik ne zna snemati zvoka.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const state = { rec, stream, started: new Date().getTime(), chunks: [] as Blob[], mime: rec.mimeType || mime || "audio/webm" };
      rec.ondataavailable = (e) => {
        if (e.data.size) state.chunks.push(e.data);
      };
      rec.onstop = () => void finish(state);
      recRef.current = state;
      rec.start(1000);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError("Mikrofon ni dovoljen: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const finish = async (state: { stream: MediaStream; started: number; chunks: Blob[]; mime: string }) => {
    state.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setRecording(false);
    const duration = (Date.now() - state.started) / 1000;
    if (!state.chunks.length) return;
    setBusy(true);
    const type = state.mime.split(";")[0];
    const ext = type.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(state.chunks, { type });
    const path = `${song.id}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from("song-memos").upload(path, blob, { contentType: type });
    if (up.error) {
      setBusy(false);
      setError("Nalaganje ni uspelo: " + up.error.message);
      return;
    }
    const { data, error: insErr } = await supabase
      .from("own_song_memos")
      .insert({ own_song_id: song.id, path, duration, label: `Posnetek ${memos.length + 1}`, created_by_name: userName || null })
      .select("*")
      .single();
    setBusy(false);
    if (insErr || !data) {
      setError("Zapis ni uspel: " + (insErr?.message ?? ""));
      return;
    }
    const row = data as OwnMemo;
    setMemos((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
  };

  const stop = () => {
    const r = recRef.current;
    if (r && r.rec.state !== "inactive") r.rec.stop();
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} flex flex-wrap items-center gap-3`}>
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-white" /> Ustavi ({fmtSec(elapsed)})
          </button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <span className="h-2.5 w-2.5 rounded-full bg-white" /> Snemaj
          </button>
        )}
        <span className="text-sm text-neutral-500">{busy ? "Nalagam posnetek …" : "Zapoj melodijo ali zaigraj ritem — posnetek vidijo vsi v bendu."}</span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!memos.length && <p className="text-sm text-neutral-500">Še ni posnetkov.</p>}
      <div className="space-y-2">
        {memos.map((m) => (
          <MemoRow key={m.id} memo={m} setMemos={setMemos} />
        ))}
      </div>
    </div>
  );
}

function MemoRow({ memo, setMemos }: { memo: OwnMemo; setMemos: React.Dispatch<React.SetStateAction<OwnMemo[]>> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [label, setLabel] = useState(memo.label ?? "");
  const [editing, setEditing] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.storage.from("song-memos").createSignedUrl(memo.path, 3600);
    if (error || !data) alert("Posnetka ni mogoče naložiti: " + (error?.message ?? ""));
    else setUrl(data.signedUrl);
  };
  const saveLabel = async () => {
    setEditing(false);
    const v = label.trim() || null;
    setMemos((prev) => prev.map((m) => (m.id === memo.id ? { ...m, label: v } : m)));
    await supabase.from("own_song_memos").update({ label: v }).eq("id", memo.id);
  };
  const remove = async () => {
    if (!confirm(`Izbrišem »${memo.label ?? "posnetek"}« za vse?`)) return;
    await supabase.storage.from("song-memos").remove([memo.path]);
    const { error } = await supabase.from("own_song_memos").delete().eq("id", memo.id);
    if (error) alert("Brisanje ni uspelo: " + error.message);
    else setMemos((prev) => prev.filter((m) => m.id !== memo.id));
  };
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void saveLabel();
            }}
          >
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT} />
            <button type="submit" className={BTN_SM}>
              Shrani
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex-1 truncate text-left text-sm font-semibold" title="Preimenuj">
            {memo.label || "Posnetek"}
          </button>
        )}
        <span className="text-xs text-neutral-500">
          {memo.duration ? fmtSec(memo.duration) : ""} · {memo.created_by_name ?? ""} · {ago(memo.created_at)}
        </span>
        <button type="button" onClick={() => void remove()} className={`${BTN_SM} hover:text-red-500`} aria-label="Izbriši">
          ✕
        </button>
      </div>
      <div className="mt-2">
        {url ? (
          <audio controls autoPlay src={url} className="w-full" />
        ) : (
          <button type="button" onClick={() => void load()} className={BTN_SM}>
            ▶ Predvajaj
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- 6. Pregled in knjižnica ----------

function PreviewStep({ song, userName, patch, flush, play, startPlay }: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const text = toUgText(song);
  const body = splitDescription(parseChords(text)).body;
  const hasBody = song.sections.some(sectionHasContent);

  const playAll = () => {
    const events: PlayEvent[] = [];
    let off = 0;
    for (const s of song.sections) {
      const t = sectionEvents(s, off);
      events.push(...t.events);
      off += t.halves;
    }
    startPlay({ id: "all", events, halves: off });
  };

  const toLibrary = async () => {
    if (!song.title.trim()) {
      setMsg("Najprej v koraku »Ideja« vpiši naslov.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("songs")
      .insert({
        user_id: LIBRARY_OWNER_ID,
        review_pending: true,
        title: song.title.trim(),
        author: song.created_by_name || userName || "Bitne Tabs",
        genre: "Pop rock",
        era: "2020s",
        origin: "Slovenska",
        mood: song.mood,
        favorite: false,
        chords_text: text,
        bpm: song.bpm,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setMsg("Ni uspelo: " + (error?.message ?? ""));
      return;
    }
    patch({ library_song_id: (data as { id: string }).id });
    await flush();
    setMsg("Skladba je v »Pregled in odobritev« — tam jo preveri in odobri, potem je v knjižnici za vse.");
  };

  const updateLibrary = async () => {
    if (!song.library_song_id) return;
    setBusy(true);
    setMsg(null);
    const { data: row, error: e1 } = await supabase
      .from("songs")
      .select("synced_lines, synced_chords, verified_player_at")
      .eq("id", song.library_song_id)
      .maybeSingle();
    if (e1 || !row) {
      setBusy(false);
      setMsg(e1 ? "Ni uspelo: " + e1.message : "Skladbe v knjižnici ni več.");
      if (!e1) patch({ library_song_id: null });
      return;
    }
    const { error } = await supabase
      .from("songs")
      .update({ title: song.title.trim(), chords_text: text, bpm: song.bpm, ...rebaseSyncOnEdit(row as Parameters<typeof rebaseSyncOnEdit>[0], text) })
      .eq("id", song.library_song_id);
    setBusy(false);
    setMsg(error ? "Ni uspelo: " + error.message : "Posodobljeno v knjižnici.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{song.title || "Brez naslova"}</div>
          <div className="text-sm text-neutral-500">
            {song.created_by_name ?? userName} · {keyLabel(song.key_tonic, song.key_minor)} · {song.bpm} BPM{song.mood ? ` · ${song.mood}` : ""}
          </div>
        </div>
        <button type="button" className={BTN} onClick={playAll} disabled={!hasBody}>
          {play?.id === "all" ? "■ Ustavi" : "▶ Zaigraj celo pesem"}
        </button>
      </div>
      {song.idea && <p className="whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300">{song.idea}</p>}

      <div className={`${CARD} font-mono text-[15px]`}>
        {!hasBody && <p className="font-sans text-sm text-neutral-500">Skladba še nima besedila ali akordov.</p>}
        {body.map((l, i) => (
          <PreviewLine key={i} line={l} />
        ))}
      </div>

      <div className={`${CARD} space-y-2`}>
        {song.library_song_id ? (
          <>
            <p className="text-sm">Skladba je že v knjižnici (ali čaka v »Pregled in odobritev«). Spremembe tukaj je ne posodobijo same.</p>
            <button type="button" className={BTN_MAIN} onClick={() => void updateLibrary()} disabled={busy || !hasBody}>
              {busy ? "Posodabljam …" : "Posodobi v knjižnici"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm">
              Ko je skladba gotova, jo prestavi v knjižnico: dobi Akorde v aplikaciji, Sam Špili, Jam in Kviz. Najprej gre v »Pregled in odobritev«.
            </p>
            <button type="button" className={BTN_MAIN} onClick={() => void toLibrary()} disabled={busy || !hasBody}>
              {busy ? "Prestavljam …" : "Prestavi v knjižnico"}
            </button>
          </>
        )}
        {msg && <p className="text-sm text-neutral-600 dark:text-neutral-300">{msg}</p>}
      </div>
    </div>
  );
}

function PreviewLine({ line }: { line: ReturnType<typeof parseChords>[number] }): ReactNode {
  if (line.kind === "section") return <div className="mb-1 mt-4 font-sans text-sm font-semibold text-amber-700 first:mt-0 dark:text-amber-400">{line.label}</div>;
  if (line.kind === "pair")
    return (
      <div className="flex flex-wrap">
        {line.chunks.map((c, i) => (
          <span key={i} className="inline-flex flex-col whitespace-pre">
            <span className="min-h-[1.4em] pr-1 font-semibold text-[var(--cv-chord)]">{c.chord ?? " "}</span>
            <span>{c.lyric || " "}</span>
          </span>
        ))}
      </div>
    );
  if (line.kind === "chords")
    return (
      <div className="flex flex-wrap gap-3 font-semibold text-[var(--cv-chord)]">
        {line.chords.map((c, i) => (
          <span key={i}>{c.name}</span>
        ))}
      </div>
    );
  if (line.kind === "text")
    return (
      <div className="min-h-[1.4em] whitespace-pre-wrap">
        {line.segments.map((s, i) => ("chord" in s ? <span key={i} className="font-semibold text-[var(--cv-chord)]">{s.chord}</span> : <span key={i}>{s.text}</span>))}
      </div>
    );
  return null;
}
