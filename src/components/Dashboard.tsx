"use client";

import { useEffect, useMemo, useState } from "react";
import Filters, { FiltersToggle } from "@/components/Filters";
import FeaturedArtists from "@/components/FeaturedArtists";
import HomeHighlights, { formatEraLabel, HighlightRow } from "@/components/HomeHighlights";
import SettingsMenu from "@/components/SettingsMenu";
import SongCard from "@/components/SongCard";
import SongForm from "@/components/SongForm";
import { DEFAULT_MOODS, DEFAULT_ORIGINS, ERAS, GENRES } from "@/lib/constants";
import { pickDailyFeatured } from "@/lib/dailyRandom";
import { emptyFilters, hasActiveFilters, type FilterState } from "@/lib/filters";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import type { SimilarSong, Song } from "@/types/song";

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [authorImages, setAuthorImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [songsVisible, setSongsVisible] = useState(true);
  const [randomPick, setRandomPick] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<"list" | "newest" | "popular">("list");
  const [prefillDraft, setPrefillDraft] = useState<{ title: string; author: string } | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  // Ko uporabnik izbere obdobje/žanr prek featured kartic na domači strani,
  // se prikazane skladbe razvrstijo po naslovu A-Z (ročno urejanje filtrov
  // ohrani privzeto razvrstitev po datumu dodajanja).
  const [sortAlpha, setSortAlpha] = useState(false);

  type PartialDimension = "genre" | "author" | "era" | "mood";
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialDimension, setPartialDimension] = useState<PartialDimension | null>(null);
  const [partialValue, setPartialValue] = useState("");
  const [partialError, setPartialError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("author_images").select("author, image_url");
      if (cancelled || error || !data) return;
      setAuthorImages(Object.fromEntries(data.map((r) => [r.author, r.image_url])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSetAuthorImage(author: string, imageUrl: string | null) {
    const prev = authorImages;
    if (imageUrl) {
      setAuthorImages((m) => ({ ...m, [author]: imageUrl }));
      const { error } = await supabase.from("author_images").upsert({ author, image_url: imageUrl });
      if (error) {
        setAuthorImages(prev);
        alert("Napaka pri shranjevanju slike: " + error.message);
      }
    } else {
      setAuthorImages((m) => {
        const next = { ...m };
        delete next[author];
        return next;
      });
      const { error } = await supabase.from("author_images").delete().eq("author", author);
      if (error) {
        setAuthorImages(prev);
        alert("Napaka pri brisanju slike: " + error.message);
      }
    }
  }

  const filteredSongs = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return songs.filter((s) => {
      if (q && !`${s.title} ${s.author}`.toLowerCase().includes(q)) return false;
      if (filters.genres.length && !filters.genres.includes(s.genre)) return false;
      if (filters.eras.length && !filters.eras.includes(s.era)) return false;
      if (filters.moods.length && (!s.mood || !filters.moods.includes(s.mood))) return false;
      if (filters.origins.length && (!s.origin || !filters.origins.includes(s.origin))) return false;
      if (filters.favoriteOnly && !s.favorite) return false;
      return true;
    });
  }, [songs, filters]);

  const displaySongs = useMemo(
    () =>
      sortAlpha
        ? [...filteredSongs].sort((a, b) => a.title.localeCompare(b.title, "sl"))
        : filteredSongs,
    [filteredSongs, sortAlpha],
  );

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

  // Izvor: enak vzorec kot razpoloženje — obrazcu privzeti predlogi + vsi že
  // uporabljeni, filtru samo tisti, ki jih trenutno resnično ima kaka skladba.
  const knownOrigins = useMemo(() => {
    const extras = new Set<string>();
    for (const s of songs)
      if (s.origin && !(DEFAULT_ORIGINS as readonly string[]).includes(s.origin)) extras.add(s.origin);
    return [...DEFAULT_ORIGINS, ...Array.from(extras).sort((a, b) => a.localeCompare(b, "sl"))];
  }, [songs]);

  const usedOrigins = useMemo(() => {
    const set = new Set<string>();
    for (const s of songs) if (s.origin) set.add(s.origin);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sl"));
  }, [songs]);

  // Za "Delno naključen" ponudimo v spustnih seznamih samo vrednosti, ki
  // jih dejansko ima vsaj ena skladba (da izbira ne vodi v prazen rezultat).
  const usedGenres = useMemo(() => GENRES.filter((g) => songs.some((s) => s.genre === g)), [songs]);
  const usedEras = useMemo(() => ERAS.filter((e) => songs.some((s) => s.era === e)), [songs]);
  const usedAuthors = useMemo(
    () => Array.from(new Set(songs.map((s) => s.author))).sort((a, b) => a.localeCompare(b, "sl")),
    [songs],
  );

  // Featured sekcije na domači strani: obdobja kronološko (kot v ERAS),
  // žanri po priljubljenosti (največ skladb najprej) — samo tisti, ki jih
  // dejansko ima vsaj ena skladba.
  const eraHighlights = useMemo(
    () =>
      ERAS.filter((e) => usedEras.includes(e)).map((era) => ({
        label: era,
        count: songs.filter((s) => s.era === era).length,
      })),
    [songs, usedEras],
  );
  const genreHighlights = useMemo(
    () =>
      usedGenres
        .map((genre) => ({ label: genre, count: songs.filter((s) => s.genre === genre).length }))
        .sort((a, b) => b.count - a.count),
    [songs, usedGenres],
  );

  // "Predstavljeno": vsak dan naključno (a ves dan stabilno) izbere dva
  // avtorja z vsaj tremi skladbami in za vsakega tri njegove skladbe.
  const featuredArtists = useMemo(() => pickDailyFeatured(songs, 4, 3), [songs]);

  // "Avtorji": vsi avtorji (največ skladb najprej), z avtorjevo sliko, če je
  // nastavljena (glej author_images / SongForm "Slika avtorja").
  const authorHighlights = useMemo(
    () =>
      usedAuthors
        .map((author) => ({ label: author, count: songs.filter((s) => s.author === author).length }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "sl")),
    [usedAuthors, songs],
  );

  // Naslov nad seznamom skladb: če je bilo izbrano natanko eno obdobje ali
  // en žanr (npr. s klikom na featured kartico), pove iz katerega.
  const songsHeading = useMemo(() => {
    if (filters.eras.length === 1 && filters.genres.length === 0) {
      return `Vsi komadi iz "${formatEraLabel(filters.eras[0])}"`;
    }
    if (filters.genres.length === 1 && filters.eras.length === 0) {
      return `Vsi komadi iz "${filters.genres[0]}"`;
    }
    return "Vsi Komadi";
  }, [filters.eras, filters.genres]);

  const PARTIAL_LABELS: Record<PartialDimension, string> = {
    genre: "Žanr",
    author: "Avtor",
    era: "Obdobje",
    mood: "Razpoloženje",
  };

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

  function handleFilterByAuthor(author: string) {
    setActiveView("list");
    setFilters({ ...emptyFilters, search: author });
    setAuthorFilter(author);
    setSortAlpha(false);
  }

  function handleFiltersChange(f: FilterState) {
    setAuthorFilter(null);
    setSortAlpha(false);
    setFilters(f);
  }

  function handleHighlightEra(era: string) {
    setActiveView("list");
    setAuthorFilter(null);
    setSortAlpha(true);
    setFilters({ ...emptyFilters, eras: [era] });
  }

  function handleHighlightGenre(genre: string) {
    setActiveView("list");
    setAuthorFilter(null);
    setSortAlpha(true);
    setFilters({ ...emptyFilters, genres: [genre] });
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

  // Obrazec za urejanje se izriše takoj pod kartico skladbe, ki jo urejamo
  // (ne na vrhu strani), da uporabnika ne "vrže" nazaj na vrh ob kliku.
  function renderEditForm(song: Song) {
    if (editing?.id !== song.id) return null;
    return (
      <div id="song-form" className="mt-3!">
        <SongForm
          key={editing.id}
          initial={editing}
          knownMoods={knownMoods}
          knownOrigins={knownOrigins}
          authorImages={authorImages}
          onSetAuthorImage={handleSetAuthorImage}
          onSaved={handleSaved}
          onClose={closeForm}
        />
      </div>
    );
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

  function handlePartialStart() {
    const dims: PartialDimension[] = ["genre", "author", "era", "mood"];
    const dim = dims[Math.floor(Math.random() * dims.length)];
    setPartialDimension(dim);
    setPartialValue("");
    setPartialError(null);
    setPartialOpen(true);
  }

  function handlePartialConfirm() {
    if (!partialDimension) return;
    const value = partialValue.trim();
    if (!value) {
      setPartialError("Vnesi vrednost.");
      return;
    }

    const pool = songs.filter((s) => {
      switch (partialDimension) {
        case "genre":
          return s.genre === value;
        case "era":
          return s.era === value;
        case "mood":
          return s.mood === value;
        case "author":
          return s.author.toLowerCase() === value.toLowerCase();
      }
    });

    if (!pool.length) {
      setPartialError(`Nobena skladba ne ustreza: ${PARTIAL_LABELS[partialDimension]} = "${value}".`);
      return;
    }

    const choice = pool[Math.floor(Math.random() * pool.length)];
    setRandomPick(choice);
    setPartialOpen(false);
  }

  // Klik kamorkoli izven gumbov Novo/Popularno ali njunega prikaznega
  // območja zapre pogled nazaj na navaden seznam.
  useEffect(() => {
    if (activeView === "list") return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-view-toggle]") || target.closest("[data-view-section]")) {
        return;
      }
      setActiveView("list");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeView]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6 lg:max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2">
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
            <span className="bg-[linear-gradient(115deg,#059669_15%,#34d399_100%)] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
              Komadi
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setPrefillDraft(null);
              setShowForm((v) => !v);
            }}
            disabled={!isSupabaseConfigured}
            aria-label="Dodaj skladbo"
            title="Dodaj skladbo"
            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(115deg,#059669_15%,#34d399_100%)] p-2.5 text-white transition hover:brightness-110 disabled:opacity-40"
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
            <SettingsMenu
              onImported={(imported) => setSongs((prev) => [...imported, ...prev])}
            />
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

      {partialOpen && partialDimension && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              🔀 Delno naključno — izbrano merilo: {PARTIAL_LABELS[partialDimension]}
            </p>
            <button
              onClick={() => setPartialOpen(false)}
              className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Zapri ✕
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {partialDimension === "author" ? (
              <>
                <input
                  list="komadi-authors-list"
                  value={partialValue}
                  onChange={(e) => {
                    setPartialValue(e.target.value);
                    setPartialError(null);
                  }}
                  placeholder="npr. Oasis"
                  className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <datalist id="komadi-authors-list">
                  {usedAuthors.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </>
            ) : (
              <select
                value={partialValue}
                onChange={(e) => {
                  setPartialValue(e.target.value);
                  setPartialError(null);
                }}
                className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">— izberi —</option>
                {(partialDimension === "genre"
                  ? usedGenres
                  : partialDimension === "era"
                    ? usedEras
                    : usedMoods
                ).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handlePartialConfirm}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Izberi naključno skladbo
            </button>
          </div>

          {partialError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{partialError}</p>
          )}
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
            authorImage={authorImages[randomPick.author] ?? null}
            onEdit={handleEdit}
            onToggleFavorite={handleToggleFavorite}
            onCopy={handleCopy}
            onAddSimilar={handleAddSimilar}
            onFilterAuthor={handleFilterByAuthor}
            highlighted
          />
          {renderEditForm(randomPick)}
          <button
            onClick={pickRandom}
            className="mt-3 text-sm text-neutral-600 hover:text-emerald-600 dark:text-neutral-300 dark:hover:text-emerald-400"
          >
            ↻ Izberi drugo
          </button>
        </div>
      )}

      {showForm && (
        <div id="song-form">
          <SongForm
            key={prefillDraft ? `prefill:${prefillDraft.title}|${prefillDraft.author}` : "new"}
            initial={null}
            prefill={prefillDraft}
            knownMoods={knownMoods}
            knownOrigins={knownOrigins}
            authorImages={authorImages}
            onSetAuthorImage={handleSetAuthorImage}
            onSaved={handleSaved}
            onClose={closeForm}
          />
        </div>
      )}

      <div className="mb-1.5! flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-600 dark:text-rose-400"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={filters.search}
            onChange={(e) => handleFiltersChange({ ...filters, search: e.target.value })}
            disabled={!isSupabaseConfigured}
            placeholder="Išči po naslovu ali avtorju…"
            className="w-full rounded-full bg-[linear-gradient(115deg,rgba(225,29,72,0.14)_15%,rgba(225,29,72,0.03)_95%)] py-2 pl-10 pr-9 text-sm text-neutral-800 placeholder-neutral-500 transition focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.24)_15%,rgba(225,29,72,0.06)_95%)] focus:outline-none disabled:opacity-40 dark:text-neutral-200 dark:placeholder-neutral-500 dark:focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.32)_15%,rgba(225,29,72,0.1)_95%)]"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => handleFiltersChange({ ...filters, search: "" })}
              aria-label="Počisti iskanje"
              title="Počisti iskanje"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="mb-1.5! flex flex-nowrap items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={pickRandom}
          disabled={!isSupabaseConfigured}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(115deg,rgba(124,58,237,0.14)_15%,rgba(124,58,237,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(124,58,237,0.24)_15%,rgba(124,58,237,0.06)_95%)] disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(124,58,237,0.32)_15%,rgba(124,58,237,0.1)_95%)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <path d="M16 8h.01" />
            <path d="M8 8h.01" />
            <path d="M8 16h.01" />
            <path d="M16 16h.01" />
            <path d="M12 12h.01" />
          </svg>
          Naključno
        </button>
        <button
          type="button"
          onClick={handlePartialStart}
          disabled={!isSupabaseConfigured}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(115deg,rgba(8,145,178,0.14)_15%,rgba(8,145,178,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(8,145,178,0.24)_15%,rgba(8,145,178,0.06)_95%)] disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(8,145,178,0.32)_15%,rgba(8,145,178,0.1)_95%)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400"
          >
            <path d="m18 14 4 4-4 4" />
            <path d="m18 2 4 4-4 4" />
            <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
            <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
            <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
          </svg>
          Delno naključno
        </button>
      </div>

      <div className="mt-0! flex flex-nowrap items-center gap-2 overflow-x-auto">
        <button
          type="button"
          data-view-toggle
          onClick={() => setActiveView((v) => (v === "newest" ? "list" : "newest"))}
          disabled={!isSupabaseConfigured}
          aria-pressed={activeView === "newest"}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            activeView === "newest"
              ? "bg-[linear-gradient(115deg,#059669_15%,#34d399_100%)] text-white"
              : "bg-[linear-gradient(115deg,rgba(16,185,129,0.14)_15%,rgba(16,185,129,0.03)_95%)] text-neutral-800 hover:bg-[linear-gradient(115deg,rgba(16,185,129,0.24)_15%,rgba(16,185,129,0.06)_95%)] dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(16,185,129,0.32)_15%,rgba(16,185,129,0.1)_95%)]"
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
              activeView === "newest" ? "text-white" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </svg>
          Novo
        </button>
        <button
          type="button"
          data-view-toggle
          onClick={() => setActiveView((v) => (v === "popular" ? "list" : "popular"))}
          disabled={!isSupabaseConfigured}
          aria-pressed={activeView === "popular"}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            activeView === "popular"
              ? "bg-[linear-gradient(115deg,#ea580c_15%,#fb923c_100%)] text-white"
              : "bg-[linear-gradient(115deg,rgba(249,115,22,0.14)_15%,rgba(249,115,22,0.03)_95%)] text-neutral-800 hover:bg-[linear-gradient(115deg,rgba(249,115,22,0.24)_15%,rgba(249,115,22,0.06)_95%)] dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(249,115,22,0.32)_15%,rgba(249,115,22,0.1)_95%)]"
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
        <FiltersToggle filters={filters} onChange={handleFiltersChange} />
      </div>

      <Filters
        filters={filters}
        onChange={handleFiltersChange}
        moodOptions={usedMoods}
        originOptions={usedOrigins}
      />

      {isSupabaseConfigured && !loading && !loadError && activeView === "list" && !hasActiveFilters(filters) && (
        <div className="mt-3! space-y-0">
          <HomeHighlights
            eras={eraHighlights}
            genres={genreHighlights}
            onSelectEra={handleHighlightEra}
            onSelectGenre={handleHighlightGenre}
          />
          <FeaturedArtists items={featuredArtists} onCopy={handleCopy} onFilterAuthor={handleFilterByAuthor} />
          <HighlightRow
            title="Avtorji"
            items={authorHighlights}
            onSelect={handleFilterByAuthor}
            images={authorImages}
          />
        </div>
      )}

      {authorFilter && (
        <div className="mt-3! rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-neutral-700 dark:text-neutral-300">
            Skladbe izvajalca:{" "}
            <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
              &quot;{authorFilter}&quot;
            </span>
          </span>
        </div>
      )}

      <section data-view-section className="mt-3! space-y-4">
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
                {songsHeading}
              </h2>
              {filters.eras.length > 0 || filters.genres.length > 0 || authorFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthorFilter(null);
                    setSortAlpha(false);
                    setFilters(emptyFilters);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                  >
                    <path d="m12 19-7-7 7-7" />
                    <path d="M19 12H5" />
                  </svg>
                  Nazaj
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSongsVisible((v) => !v)}
                  aria-expanded={songsVisible}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 shrink-0 transition-transform ${songsVisible ? "" : "-rotate-90"}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  {songsVisible ? "Skrij komade" : "Prikaži vse komade"}
                </button>
              )}
            </div>

            {songsVisible && (
              <>
                {displaySongs.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    {songs.length === 0
                      ? "Baza je še prazna — dodaj prvo skladbo."
                      : "Nobena skladba ne ustreza izbranim filtrom."}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {displaySongs.map((song) => (
                    <div key={song.id}>
                      <SongCard
                        song={song}
                        authorImage={authorImages[song.author] ?? null}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggleFavorite={handleToggleFavorite}
                        onCopy={handleCopy}
                        onAddSimilar={handleAddSimilar}
                        onFilterAuthor={handleFilterByAuthor}
                      />
                      {randomPick?.id !== song.id && renderEditForm(song)}
                    </div>
                  ))}
                </div>
              </>
            )}
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
      className={`relative flex min-w-0 cursor-pointer items-center gap-3 border p-3 transition hover:-translate-y-0.5 ${
        highlighted
          ? // Oblika trzalice (guitar pick): oster kot = konica, preostali
            // trije zaobljeni = telo trzalice.
            "rounded-tl-sm rounded-tr-3xl rounded-br-3xl rounded-bl-3xl border-orange-400 bg-orange-500/10 dark:border-orange-600"
          : "rounded-xl border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
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
