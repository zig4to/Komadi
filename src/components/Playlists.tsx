"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { Playlist, PlaylistSong, Song } from "@/types/song";

// "Playliste" (celostranski pogled, gumb desno od "Jam"): poimenovani seznami
// skladb iz knjižnice — tabeli playlists + playlist_songs (0025). Seznam
// playlist → klik odpre playlisto (Android "Nazaj" jo zapre) s skladbami kot
// običajnimi karticami (renderSongCard iz Dashboard.tsx) in iskalnikom za
// dodajanje.

// Slovenska dvojina/množina: 1 skladba, 2 skladbi, 3–4 skladbe, 5+ skladb.
function skladb(n: number) {
  const m = n % 100;
  if (m === 1) return `${n} skladba`;
  if (m === 2) return `${n} skladbi`;
  if (m === 3 || m === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

const inputClass =
  "w-full rounded-full border border-yellow-500/40 bg-[linear-gradient(115deg,rgba(202,138,4,0.14)_15%,rgba(202,138,4,0.03)_95%)] px-4 py-2 text-sm text-neutral-800 placeholder-neutral-500 transition focus:outline-none dark:border-yellow-400/40 dark:text-neutral-200 dark:placeholder-neutral-500";
const buttonClass =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-500/40 bg-[linear-gradient(115deg,rgba(202,138,4,0.14)_15%,rgba(202,138,4,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(202,138,4,0.24)_15%,rgba(202,138,4,0.06)_95%)] disabled:opacity-40 dark:border-yellow-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(202,138,4,0.32)_15%,rgba(202,138,4,0.1)_95%)]";

export default function Playlists({
  songs,
  renderSongCard,
}: {
  songs: Song[];
  renderSongCard: (song: Song) => React.ReactNode;
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [entries, setEntries] = useState<PlaylistSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  useBackableOpen(selectedId !== null, () => setSelectedId(null));
  useBackableOpen(pickerOpen, () => setPickerOpen(false));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pl, ps] = await Promise.all([
        supabase.from("playlists").select("*").order("created_at", { ascending: false }),
        supabase.from("playlist_songs").select("*").order("added_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const err = pl.error ?? ps.error;
      if (err) setError(err.message);
      else {
        setPlaylists(pl.data as Playlist[]);
        setEntries(ps.data as PlaylistSong[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const selectedEntries = entries.filter((e) => e.playlist_id === selectedId);
  const selectedSongIds = new Set(selectedEntries.map((e) => e.song_id));

  const pickerResults = useMemo(() => {
    const words = pickerQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return songs
      .filter((s) => {
        const hay = `${s.title} ${s.author}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 20);
  }, [songs, pickerQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("playlists").insert({ name }).select().single();
    if (error) {
      setError(error.message);
      return;
    }
    setPlaylists((prev) => [data as Playlist, ...prev]);
    setNewName("");
    setSelectedId((data as Playlist).id);
  }

  async function handleDeletePlaylist(p: Playlist) {
    if (!window.confirm(`Izbrišem playlisto "${p.name}"? Skladbe ostanejo v knjižnici.`)) return;
    const { error } = await supabase.from("playlists").delete().eq("id", p.id);
    if (error) {
      setError(error.message);
      return;
    }
    setPlaylists((prev) => prev.filter((x) => x.id !== p.id));
    setEntries((prev) => prev.filter((x) => x.playlist_id !== p.id));
    setSelectedId(null);
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!selected || !name) return;
    const { error } = await supabase.from("playlists").update({ name }).eq("id", selected.id);
    if (error) {
      setError(error.message);
      return;
    }
    setPlaylists((prev) => prev.map((p) => (p.id === selected.id ? { ...p, name } : p)));
    setRenaming(false);
  }

  async function handleAddSong(song: Song) {
    if (!selectedId || selectedSongIds.has(song.id)) return;
    const { data, error } = await supabase
      .from("playlist_songs")
      .insert({ playlist_id: selectedId, song_id: song.id })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setEntries((prev) => [...prev, data as PlaylistSong]);
  }

  async function handleRemoveSong(entry: PlaylistSong) {
    const { error } = await supabase.from("playlist_songs").delete().eq("id", entry.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEntries((prev) => prev.filter((x) => x.id !== entry.id));
  }

  if (loading) return <p className="text-sm text-neutral-500 dark:text-neutral-400">Nalagam playliste…</p>;

  const errorLine = error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  if (selected) {
    return (
      <div className="space-y-4">
        {errorLine}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setPickerOpen(false);
              setRenaming(false);
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-yellow-600 dark:text-neutral-300 dark:hover:text-yellow-400"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Vse playliste
          </button>
        </div>

        {renaming ? (
          <form onSubmit={handleRename} className="flex items-center gap-2">
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className={inputClass} />
            <button type="submit" className={buttonClass}>Shrani</button>
            <button type="button" onClick={() => setRenaming(false)} className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
              Prekliči
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{selected.name}</h2>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{skladb(selectedEntries.length)}</span>
            <button
              type="button"
              onClick={() => {
                setRenameValue(selected.name);
                setRenaming(true);
              }}
              className="text-sm text-neutral-500 hover:text-yellow-600 dark:text-neutral-400 dark:hover:text-yellow-400"
            >
              Preimenuj
            </button>
            <button
              type="button"
              onClick={() => handleDeletePlaylist(selected)}
              className="text-sm text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
            >
              Izbriši
            </button>
          </div>
        )}

        {pickerOpen ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Išči po naslovu ali avtorju…"
                className={inputClass}
              />
              <button type="button" onClick={() => setPickerOpen(false)} className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
                Končano
              </button>
            </div>
            {pickerQuery.trim() && pickerResults.length === 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Ni zadetkov.</p>
            )}
            <div className="space-y-1.5">
              {pickerResults.map((song) => {
                const added = selectedSongIds.has(song.id);
                return (
                  <button
                    key={song.id}
                    type="button"
                    disabled={added}
                    onClick={() => handleAddSong(song)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-yellow-500 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-yellow-400"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{song.title}</span>
                      <span className="text-neutral-500 dark:text-neutral-400"> — {song.author}</span>
                    </span>
                    <span className="shrink-0 text-yellow-600 dark:text-yellow-400">{added ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPickerQuery("");
              setPickerOpen(true);
            }}
            className={buttonClass}
          >
            <span className="text-yellow-600 dark:text-yellow-400">+</span>
            Dodaj skladbo
          </button>
        )}

        {selectedEntries.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Playlista je še prazna.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selectedEntries.map((entry) => {
              const song = songById.get(entry.song_id);
              if (!song) return null;
              return (
                <div key={entry.id} className="space-y-1.5">
                  {renderSongCard(song)}
                  <button
                    type="button"
                    onClick={() => handleRemoveSong(entry)}
                    className="text-xs text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                  >
                    Odstrani s playliste
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorLine}
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ime nove playliste" className={inputClass} />
        <button type="submit" disabled={!newName.trim()} className={buttonClass}>
          Ustvari
        </button>
      </form>

      {playlists.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Še nimaš nobene playliste.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((p) => {
            const count = entries.filter((e) => e.playlist_id === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-[linear-gradient(115deg,rgba(202,138,4,0.10)_15%,rgba(202,138,4,0.02)_95%)] px-4 py-3 text-left transition hover:border-yellow-500 dark:border-yellow-400/30 dark:hover:border-yellow-400"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0 text-yellow-600 dark:text-yellow-400">
                  <path d="M16 6H3" />
                  <path d="M12 12H3" />
                  <path d="M12 18H3" />
                  <path d="M21 15V6" />
                  <circle cx="18.5" cy="15.5" r="2.5" />
                </svg>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900 dark:text-neutral-100">{p.name}</span>
                  <span className="block text-sm text-neutral-500 dark:text-neutral-400">{skladb(count)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
