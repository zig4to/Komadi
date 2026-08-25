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

  function handleAdded(song: Song) {
    setSongs((prev) => [song, ...prev]);
    setShowForm(false);
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
          <h1 className="text-2xl font-bold">🎸 Komadi</h1>
          <p className="text-sm text-neutral-400">Moje skladbe za igranje na kitaro</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={pickRandom}
            disabled={!isSupabaseConfigured}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-100"
          >
            🎲 Naključna
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            disabled={!isSupabaseConfigured}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            + Dodaj skladbo
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
            onDelete={handleDelete}
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

      {showForm && <SongForm onAdded={handleAdded} onClose={() => setShowForm(false)} />}

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
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
      </section>
    </div>
  );
}
