"use client";

import { useEffect, useMemo, useState } from "react";
import Filters from "@/components/Filters";
import SettingsMenu from "@/components/SettingsMenu";
import SongCard from "@/components/SongCard";
import SongForm from "@/components/SongForm";
import { DEFAULT_MOODS } from "@/lib/constants";
import { emptyFilters, type FilterState } from "@/lib/filters";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import type { SimilarSong, Song } from "@/types/song";

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [randomPick, setRandomPick] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<"list" | "newest" | "popular">("list");
  const [prefillDraft, setPrefillDraft] = useState<{ title: string; author: string } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
      } else {
        setSongs(data as Song[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSongs = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return songs.filter((s) => {
      if (q && !`${s.title} ${s.author}`.toLowerCase().includes(q)) return false;
      if (filters.genres.length && !filters.genres.includes(s.genre)) return false;
      if (filters.eras.length && !filters.eras.includes(s.era)) return false;
      if (filters.moods.length && (!s.mood || !filters.moods.includes(s.mood))) return false;
      if (filters.favoriteOnly && !s.favorite) return false;
      return true;
    });
  }, [songs, filters]);

  // Razpoloženja niso fiksen nabor: obrazcu ponudimo privzete predloge +
  // vsa že uporabljena (uporabniško dodana), filtru pa samo tista, ki jih
  // trenutno resnično ima kaka skladba (da ni praznih/neuporabnih čipov).
  const knownMoods = useMemo(() => {
    const extras = new Set<string>();
    for (const s of songs) if (s.mood && !(DEFAULT_MOODS as readonly string[]).includes(s.mood)) extras.add(s.mood);
    return [...DEFAULT_MOODS, ...Array.from(extras).sort((a, b) => a.localeCompare(b, "sl"))];
  }, [songs]);

  const usedMoods = useMemo(() => {
    const set = new Set<string>();
    for (const s of songs) if (s.mood) set.add(s.mood);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sl"));
  }, [songs]);

  const newestFirst = useMemo(
    () =>
      [...songs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [songs],
  );

  const mostPopular = useMemo(
    () =>
      [...songs].sort((a, b) => {
        if (b.copy_count !== a.copy_count) return b.copy_count - a.copy_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [songs],
  );

  function handleSaved(saved: Song, mode: "insert" | "update") {
    if (mode === "insert") {
      setSongs((prev) => [saved, ...prev]);
    } else {
      setSongs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setRandomPick((p) => (p?.id === saved.id ? saved : p));
    }
    setShowForm(false);
    setEditing(null);
    setPrefillDraft(null);
  }

  function handleEdit(song: Song) {
    setShowForm(false);
    setEditing(song);
    setPrefillDraft(null);
    setTimeout(
      () =>
        document
          .getElementById("song-form")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  }

  function handleAddSimilar(song: SimilarSong) {
    setEditing(null);
    setShowForm(true);
    setPrefillDraft({ title: song.title, author: song.author });
    setTimeout(
      () =>
        document
          .getElementById("song-form")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setPrefillDraft(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Izbrišem to skladbo iz baze?")) return;
    const prev = songs;
    setSongs((s) => s.filter((song) => song.id !== id));
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) {
      setSongs(prev);
      alert("Napaka pri brisanju: " + error.message);
    }
    if (randomPick?.id === id) setRandomPick(null);
  }

  async function handleToggleFavorite(song: Song) {
    const next = { ...song, favorite: !song.favorite };
    setSongs((s) => s.map((x) => (x.id === song.id ? next : x)));
    const { error } = await supabase
      .from("songs")
      .update({ favorite: next.favorite })
      .eq("id", song.id);
    if (error) {
      setSongs((s) => s.map((x) => (x.id === song.id ? song : x)));
    }
  }

  async function handleCopy(song: Song) {
    const nextCount = (song.copy_count ?? 0) + 1;
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, copy_count: nextCount } : x)));
    // Najbolje-trud: če stolpec copy_count še ne obstaja (migracija ni
    // zagnana) ali klic spodleti, samo tiho ignoriramo — kopiranje v
    // odložišče je uporabniku že uspelo.
    await supabase.from("songs").update({ copy_count: nextCount }).eq("id", song.id);
  }

  function pickRandom() {
    const pool = filteredSongs.length ? filteredSongs : songs;
    if (!pool.length) {
      setRandomPick(null);
      return;
    }
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setRandomPick(choice);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400"
            >
              <path d="m11.9 12.1 4.514-4.514" />
              <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z" />
              <path d="m6 16 2 2" />
              <path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z" />
            </svg>
            Komadi
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={pickRandom}
            disabled={!isSupabaseConfigured}
            aria-label="Naključna skladba"
            title="Naključna skladba"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-300 p-2 hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-40 dark:border-neutral-700 dark:hover:text-emerald-400"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px] shrink-0"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <path d="M16 8h.01" />
              <path d="M8 8h.01" />
              <path d="M8 16h.01" />
              <path d="M16 16h.01" />
              <path d="M12 12h.01" />
            </svg>
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setPrefillDraft(null);
              setShowForm((v) => !v);
            }}
            disabled={!isSupabaseConfigured}
            aria-label="Dodaj skladbo"
            title="Dodaj skladbo"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px] shrink-0"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <div className="ml-1.5">
            <SettingsMenu />
          </div>
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Supabase še ni nastavljen. Kopiraj{" "}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">.env.local.example</code> v{" "}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">.env.local</code>, vnesi URL in anon
          ključ svojega Supabase projekta ter poženi{" "}
          <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">supabase/schema.sql</code> v SQL
          Editorju, nato ponovno zaženi <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">npm run dev</code>.
        </div>
      )}

      {randomPick && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">🎲 Naključno izbrana skladba</p>
            <button
              onClick={() => setRandomPick(null)}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Zapri ✕
            </button>
          </div>
          <SongCard
            song={randomPick}
            onEdit={handleEdit}
            onToggleFavorite={handleToggleFavorite}
            onCopy={handleCopy}
            onAddSimilar={handleAddSimilar}
            highlighted
          />
          <button
            onClick={pickRandom}
            className="mt-3 text-sm text-neutral-600 hover:text-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-400"
          >
            ↻ Izberi drugo
          </button>
        </div>
      )}

      {(showForm || editing) && (
        <div id="song-form">
          <SongForm
            key={
              editing?.id ??
              (prefillDraft ? `prefill:${prefillDraft.title}|${prefillDraft.author}` : "new")
            }
            initial={editing}
            prefill={editing ? null : prefillDraft}
            knownMoods={knownMoods}
            onSaved={handleSaved}
            onClose={closeForm}
          />
        </div>
      )}

      <Filters
        filters={filters}
        onChange={setFilters}
        resultCount={filteredSongs.length}
        moodOptions={usedMoods}
      />

      <div className="mt-3! flex gap-2">
        <button
          type="button"
          onClick={() => setActiveView((v) => (v === "newest" ? "list" : "newest"))}
          disabled={!isSupabaseConfigured}
          aria-pressed={activeView === "newest"}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            activeView === "newest"
              ? "bg-emerald-600 text-white"
              : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </svg>
          Novo
        </button>
        <button
          type="button"
          onClick={() => setActiveView((v) => (v === "popular" ? "list" : "popular"))}
          disabled={!isSupabaseConfigured}
          aria-pressed={activeView === "popular"}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            activeView === "popular"
              ? "bg-orange-600 text-white"
              : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 shrink-0 ${
              activeView === "popular" ? "text-white" : "text-orange-500"
            }`}
          >
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
          </svg>
          Popularno
        </button>
      </div>

      <section className="space-y-4">
        {loading && <p className="text-sm text-neutral-500">Nalagam skladbe…</p>}
        {loadError && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
            Napaka pri nalaganju: {loadError}
          </p>
        )}

        {!loading && !loadError && activeView === "newest" && (
          newestFirst.length === 0 ? (
            <p className="text-sm text-neutral-500">Baza je še prazna — dodaj prvo skladbo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {newestFirst.map((song) => (
                <CompactCard key={song.id} song={song} onCopy={handleCopy} />
              ))}
            </div>
          )
        )}

        {!loading && !loadError && activeView === "popular" && (
          mostPopular.length === 0 ? (
            <p className="text-sm text-neutral-500">Baza je še prazna — dodaj prvo skladbo.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">Top 5</p>
              {mostPopular.slice(0, 5).map((song, i) => (
                <CompactRow key={song.id} song={song} rank={i + 1} onCopy={handleCopy} highlighted />
              ))}
              {mostPopular.slice(5).map((song, i) => (
                <CompactRow key={song.id} song={song} rank={i + 6} onCopy={handleCopy} />
              ))}
            </div>
          )
        )}

        {!loading && !loadError && activeView === "list" && (
          <>
            {filteredSongs.length === 0 && (
              <p className="text-sm text-neutral-500">
                {songs.length === 0
                  ? "Baza je še prazna — dodaj prvo skladbo."
                  : "Nobena skladba ne ustreza izbranim filtrom."}
              </p>
            )}
            {filteredSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleFavorite={handleToggleFavorite}
                onCopy={handleCopy}
                onAddSimilar={handleAddSimilar}
              />
            ))}
          </>
        )}
      </section>
    </div>
  );
}

function CompactCard({ song, onCopy }: { song: Song; onCopy?: (song: Song) => void }) {
  const [copied, triggerCopy] = useCopyFeedback();

  return (
    <div
      onClick={() => triggerCopy(song.title).then((ok) => ok && onCopy?.(song))}
      title="Klikni za kopiranje naslova"
      className="relative min-w-0 cursor-pointer rounded-xl border border-neutral-200 bg-white p-3 transition hover:-translate-y-0.5 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
      <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{song.author}</p>
      {copied && (
        <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-neutral-200 dark:bg-neutral-950/80 dark:text-emerald-400 dark:ring-0">
          kopirano :)
        </span>
      )}
    </div>
  );
}

function CompactRow({
  song,
  rank,
  onCopy,
  highlighted = false,
}: {
  song: Song;
  rank: number;
  onCopy?: (song: Song) => void;
  highlighted?: boolean;
}) {
  const [copied, triggerCopy] = useCopyFeedback();

  return (
    <div
      onClick={() => triggerCopy(song.title).then((ok) => ok && onCopy?.(song))}
      title="Klikni za kopiranje naslova"
      className={`relative flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 ${
        highlighted
          ? "border-orange-400 bg-orange-500/10 dark:border-orange-600"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <span
        className={`w-5 shrink-0 text-right text-sm font-semibold ${
          highlighted ? "text-orange-600 dark:text-orange-400" : "text-neutral-400 dark:text-neutral-600"
        }`}
      >
        {rank}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{song.author}</p>
      </div>
      {copied && (
        <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-neutral-200 dark:bg-neutral-950/80 dark:text-emerald-400 dark:ring-0">
          kopirano :)
        </span>
      )}
    </div>
  );
}
