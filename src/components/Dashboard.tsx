"use client";

import { useEffect, useMemo, useState } from "react";
import Filters from "@/components/Filters";
import SongCard from "@/components/SongCard";
import SongForm from "@/components/SongForm";
import { emptyFilters, type FilterState } from "@/lib/filters";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Song } from "@/types/song";

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [randomPick, setRandomPick] = useState<Song | null>(null);

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
      if (filters.favoriteOnly && !s.favorite) return false;
      return true;
    });
  }, [songs, filters]);

  function handleSaved(saved: Song, mode: "insert" | "update") {
    if (mode === "insert") {
      setSongs((prev) => [saved, ...prev]);
    } else {
      setSongs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setRandomPick((p) => (p?.id === saved.id ? saved : p));
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(song: Song) {
    setShowForm(false);
    setEditing(song);
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
              className="h-6 w-6 shrink-0 text-emerald-400"
            >
              <path d="m11.9 12.1 4.514-4.514" />
              <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z" />
              <path d="m6 16 2 2" />
              <path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z" />
            </svg>
            Komadi
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={pickRandom}
            disabled={!isSupabaseConfigured}
            aria-label="Naključna skladba"
            title="Naključna skladba"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-700 p-2 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-100"
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
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-300">
          Supabase še ni nastavljen. Kopiraj{" "}
          <code className="rounded bg-neutral-800 px-1">.env.local.example</code> v{" "}
          <code className="rounded bg-neutral-800 px-1">.env.local</code>, vnesi URL in anon
          ključ svojega Supabase projekta ter poženi{" "}
          <code className="rounded bg-neutral-800 px-1">supabase/schema.sql</code> v SQL
          Editorju, nato ponovno zaženi <code className="rounded bg-neutral-800 px-1">npm run dev</code>.
        </div>
      )}

      {randomPick && (
        <div className="rounded-xl border border-emerald-500 bg-emerald-500/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-400">🎲 Naključno izbrana skladba</p>
            <button
              onClick={() => setRandomPick(null)}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              Zapri ✕
            </button>
          </div>
          <SongCard
            song={randomPick}
            onEdit={handleEdit}
            onToggleFavorite={handleToggleFavorite}
            highlighted
          />
          <button
            onClick={pickRandom}
            className="mt-3 text-sm text-neutral-300 hover:text-emerald-400"
          >
            ↻ Izberi drugo
          </button>
        </div>
      )}

      {(showForm || editing) && (
        <div id="song-form">
          <SongForm
            key={editing?.id ?? "new"}
            initial={editing}
            onSaved={handleSaved}
            onClose={closeForm}
          />
        </div>
      )}

      <Filters filters={filters} onChange={setFilters} resultCount={filteredSongs.length} />

      <section className="space-y-3">
        {loading && <p className="text-sm text-neutral-500">Nalagam skladbe…</p>}
        {loadError && (
          <p className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-400">
            Napaka pri nalaganju: {loadError}
          </p>
        )}
        {!loading && !loadError && filteredSongs.length === 0 && (
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
          />
        ))}
      </section>
    </div>
  );
}
