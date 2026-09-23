"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ChordsButtons from "@/components/ChordsButtons";
import Filters, { FiltersToggle } from "@/components/Filters";
import FeaturedArtists from "@/components/FeaturedArtists";
import HomeHighlights, { ACCENTS, formatEraLabel, HighlightRow } from "@/components/HomeHighlights";
import SettingsMenu from "@/components/SettingsMenu";
import SongCard from "@/components/SongCard";
import SongForm from "@/components/SongForm";
import { authorAccentHex } from "@/lib/authorColor";
import { DEFAULT_MOODS, DEFAULT_ORIGINS, ERAS, GENRES } from "@/lib/constants";
import { pickDailyFeatured } from "@/lib/dailyRandom";
import { emptyFilters, hasActiveFilters, type FilterState } from "@/lib/filters";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { usePersistentBool } from "@/lib/usePersistentBool";
import type { GoalExtra, JamExtra, SimilarSong, Song } from "@/types/song";

interface RecentGroup {
  label: string;
  songs: Song[];
}

// Za zavihek "Novo": razdeli skladbe po dani lastnosti (avtor/obdobje/
// razpoloženje), obdrži samo skupine z vsaj eno skladbo, jih razvrsti po
// datumu najbolj nedavno dodane skladbe v skupini (najnovejše najprej) in
// za vsako obdrži le njenih `songsPerGroup` najnovejših skladb.
function groupByRecent(
  songs: Song[],
  keyOf: (song: Song) => string | null,
  maxGroups: number,
  songsPerGroup: number,
): RecentGroup[] {
  const byKey = new Map<string, Song[]>();
  for (const song of songs) {
    const key = keyOf(song);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(song);
    else byKey.set(key, [song]);
  }

  return Array.from(byKey.entries())
    .map(([label, list]) => {
      const sorted = [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return { label, latest: new Date(sorted[0].created_at).getTime(), songs: sorted.slice(0, songsPerGroup) };
    })
    .sort((a, b) => b.latest - a.latest)
    .slice(0, maxGroups)
    .map(({ label, songs }) => ({ label, songs }));
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [authorImages, setAuthorImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Song | null>(null);
  // Klik na glavni "+" najprej vpraša hitro/prek telefona (addChoiceOpen);
  // "Hitro" odpre samo naslov+avtor in zapiše v queued_songs (glej
  // SettingsMenu.tsx "Čakalna vrsta" za prikaz/upravljanje), "Prek telefona"
  // odpre obstoječi celoten SongForm (showForm, brez sprememb).
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddAuthor, setQuickAddAuthor] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [songsVisible, setSongsVisible] = useState(true);
  // Na namizju (lg) je seznam vseh skladb privzeto skrit — na mobilnem
  // ostane viden (podatek o širini zaslona ni na voljo pred hidracijo, zato
  // to preveri šele po prvem izrisu).
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setSongsVisible(false);
  }, []);
  const [randomPick, setRandomPick] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<"list" | "newest" | "popular">("list");
  // Obstojno stanje (localStorage), da osvežitev strani med jam sessionom ne
  // vrže nazaj na domačo stran — glej usePersistentBool.
  const [jamOpen, setJamOpen] = usePersistentBool("komadi:jam:open", false);
  const [jamPickerOpen, setJamPickerOpen] = useState(false);
  const [jamPickerQuery, setJamPickerQuery] = useState("");
  const [jamExtras, setJamExtras] = useState<JamExtra[]>([]);
  const [jamQuickAddOpen, setJamQuickAddOpen] = useState(false);
  const [jamQuickAddTitle, setJamQuickAddTitle] = useState("");
  const [jamQuickAddAuthor, setJamQuickAddAuthor] = useState("");
  const [jamQuickAddError, setJamQuickAddError] = useState<string | null>(null);
  // "Mojih 20 skladb": osebni seznam za naučit do konca leta — isti vzorec
  // kot Jam (persist odprtost, iskalni izbirnik, "Skladbe ni" hitri vnos),
  // samo z own poljema (goal_added_at/goal_learned, goal_extras) in brez
  // "trenutna/naslednja" oznak, ker ne gre za živo sejo.
  const [goalOpen, setGoalOpen] = usePersistentBool("komadi:goal:open", false);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [goalPickerQuery, setGoalPickerQuery] = useState("");
  const [goalExtras, setGoalExtras] = useState<GoalExtra[]>([]);
  const [goalQuickAddOpen, setGoalQuickAddOpen] = useState(false);
  const [goalQuickAddTitle, setGoalQuickAddTitle] = useState("");
  const [goalQuickAddAuthor, setGoalQuickAddAuthor] = useState("");
  const [goalQuickAddError, setGoalQuickAddError] = useState<string | null>(null);
  const [prefillDraft, setPrefillDraft] = useState<{ title: string; author: string } | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  // Položaj skrolanja na domači strani tik pred klikom na avtorja/obdobje/
  // žanr (Obdobja, Žanri, Predstavljeno, Avtorji) — gumb "Nazaj" se vrne na
  // to mesto, namesto da bi po vrnitvi ostal na vrhu strani.
  const homeScrollY = useRef(0);

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

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("jam_extras").select("*").order("added_at", { ascending: true });
      if (cancelled || error || !data) return;
      setJamExtras(data as JamExtra[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("goal_extras").select("*").order("added_at", { ascending: true });
      if (cancelled || error || !data) return;
      setGoalExtras(data as GoalExtra[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime naročnina (glej supabase/migrations/0013_enable_realtime.sql):
  // vsaka sprememba `songs`/`jam_extras` (tudi tista, ki jo sproži kdo drug
  // v isti sobi med jam sessionom) se takoj zlije v lokalno stanje, brez
  // osvežitve strani. Lastne optimistične spremembe se ob echo dogodku samo
  // brez učinka prepišejo z isto vrednostjo.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("songs-and-extras")
      .on<Song>("postgres_changes", { event: "*", schema: "public", table: "songs" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const song = payload.new;
          setSongs((prev) => (prev.some((s) => s.id === song.id) ? prev : [song, ...prev]));
        } else if (payload.eventType === "UPDATE") {
          const song = payload.new;
          setSongs((prev) => prev.map((s) => (s.id === song.id ? song : s)));
        } else if (payload.eventType === "DELETE") {
          const id = payload.old.id;
          if (id) setSongs((prev) => prev.filter((s) => s.id !== id));
        }
      })
      .on<JamExtra>("postgres_changes", { event: "*", schema: "public", table: "jam_extras" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const extra = payload.new;
          setJamExtras((prev) => (prev.some((x) => x.id === extra.id) ? prev : [...prev, extra]));
        } else if (payload.eventType === "UPDATE") {
          const extra = payload.new;
          setJamExtras((prev) => prev.map((x) => (x.id === extra.id ? extra : x)));
        } else if (payload.eventType === "DELETE") {
          const id = payload.old.id;
          if (id) setJamExtras((prev) => prev.filter((x) => x.id !== id));
        }
      })
      .on<GoalExtra>("postgres_changes", { event: "*", schema: "public", table: "goal_extras" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const extra = payload.new;
          setGoalExtras((prev) => (prev.some((x) => x.id === extra.id) ? prev : [...prev, extra]));
        } else if (payload.eventType === "UPDATE") {
          const extra = payload.new;
          setGoalExtras((prev) => prev.map((x) => (x.id === extra.id ? extra : x)));
        } else if (payload.eventType === "DELETE") {
          const id = payload.old.id;
          if (id) setGoalExtras((prev) => prev.filter((x) => x.id !== id));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
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

  const jamSongs = useMemo(
    () =>
      songs
        .filter((s) => s.jam_added_at)
        .sort((a, b) => (a.jam_added_at ?? "").localeCompare(b.jam_added_at ?? "")),
    [songs],
  );

  // Jam prikazuje prave skladbe (jamSongs) in začasne "Skladbe ni" vnose
  // (jamExtras) v enem seznamu, razvrščenem po tem, kdaj je bil kateri dodan.
  type JamItem = { key: string; title: string; author: string; played: boolean } & (
    | { kind: "song"; song: Song }
    | { kind: "extra"; extra: JamExtra }
  );
  const jamItems = useMemo<JamItem[]>(() => {
    const items: (JamItem & { addedAt: string })[] = [
      ...jamSongs.map((song) => ({
        key: `song:${song.id}`,
        kind: "song" as const,
        song,
        title: song.title,
        author: song.author,
        played: song.jam_played,
        addedAt: song.jam_added_at ?? "",
      })),
      ...jamExtras.map((extra) => ({
        key: `extra:${extra.id}`,
        kind: "extra" as const,
        extra,
        title: extra.title,
        author: extra.author,
        played: extra.played,
        addedAt: extra.added_at,
      })),
    ];
    return items.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }, [jamSongs, jamExtras]);

  // "Trenutna"/"Naslednja" oznaki v Jam čakalni vrsti sledita prvima dvema
  // še neobkljukanima skladbama v vrstnem redu vrste — ko se prva obkljuka,
  // se avtomatsko premakneta na naslednji še neodigrani skladbi.
  const firstUnplayedJamKey = useMemo(
    () => jamItems.find((item) => !item.played)?.key ?? null,
    [jamItems],
  );
  const secondUnplayedJamKey = useMemo(() => {
    const unplayed = jamItems.filter((item) => !item.played);
    return unplayed[1]?.key ?? null;
  }, [jamItems]);

  const jamPickerResults = useMemo(() => {
    const q = jamPickerQuery.trim().toLowerCase();
    if (!q) return [];
    return songs
      .filter((s) => !s.jam_added_at)
      .filter((s) => `${s.title} ${s.author}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [songs, jamPickerQuery]);

  const goalSongs = useMemo(
    () =>
      songs
        .filter((s) => s.goal_added_at)
        .sort((a, b) => (a.goal_added_at ?? "").localeCompare(b.goal_added_at ?? "")),
    [songs],
  );

  // "Mojih 20 skladb" prikazuje prave skladbe (goalSongs) in začasne
  // "Skladbe ni" vnose (goalExtras) v enem seznamu, enak vzorec kot JamItem.
  type GoalItem = { key: string; title: string; author: string; learned: boolean } & (
    | { kind: "song"; song: Song }
    | { kind: "extra"; extra: GoalExtra }
  );
  const goalItems = useMemo<GoalItem[]>(() => {
    const items: (GoalItem & { addedAt: string })[] = [
      ...goalSongs.map((song) => ({
        key: `song:${song.id}`,
        kind: "song" as const,
        song,
        title: song.title,
        author: song.author,
        learned: song.goal_learned,
        addedAt: song.goal_added_at ?? "",
      })),
      ...goalExtras.map((extra) => ({
        key: `extra:${extra.id}`,
        kind: "extra" as const,
        extra,
        title: extra.title,
        author: extra.author,
        learned: extra.learned,
        addedAt: extra.added_at,
      })),
    ];
    return items.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }, [goalSongs, goalExtras]);

  const goalPickerResults = useMemo(() => {
    const q = goalPickerQuery.trim().toLowerCase();
    if (!q) return [];
    return songs
      .filter((s) => !s.goal_added_at)
      .filter((s) => `${s.title} ${s.author}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [songs, goalPickerQuery]);

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
    () => [...filteredSongs].sort((a, b) => a.title.localeCompare(b.title, "sl")),
    [filteredSongs],
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

  // Zavihek "Novo": nad neskončnim seznamom najprej 10 nedavno dodanih,
  // spodaj pa še skupine "Novo po ..." (avtor/obdobje/razpoloženje) — vsaka
  // skupina prikaže do 4 najnovejše skladbe, skupine same so razvrščene po
  // tem, katera ima najbolj nedavno dodano skladbo.
  const recentTop = useMemo(() => newestFirst.slice(0, 10), [newestFirst]);
  const newByAuthor = useMemo(() => groupByRecent(songs, (s) => s.author, 4, 4), [songs]);
  const newByEra = useMemo(() => groupByRecent(songs, (s) => s.era, 4, 4), [songs]);
  const newByMood = useMemo(() => groupByRecent(songs, (s) => s.mood, 4, 4), [songs]);

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
    homeScrollY.current = window.scrollY;
    setActiveView("list");
    setFilters({ ...emptyFilters, search: author });
    setAuthorFilter(author);
  }

  function handleFiltersChange(f: FilterState) {
    setAuthorFilter(null);
    setFilters(f);
  }

  function handleHighlightEra(era: string) {
    homeScrollY.current = window.scrollY;
    setActiveView("list");
    setAuthorFilter(null);
    setFilters({ ...emptyFilters, eras: [era] });
  }

  function handleHighlightGenre(genre: string) {
    homeScrollY.current = window.scrollY;
    setActiveView("list");
    setAuthorFilter(null);
    setFilters({ ...emptyFilters, genres: [genre] });
  }

  function handleBackFromFilter() {
    setAuthorFilter(null);
    setFilters(emptyFilters);
    setTimeout(() => window.scrollTo({ top: homeScrollY.current }), 50);
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

  function closeQuickAdd() {
    setQuickAddOpen(false);
    setQuickAddTitle("");
    setQuickAddAuthor("");
    setQuickAddError(null);
  }

  async function handleConfirmQuickAdd() {
    const title = quickAddTitle.trim();
    const author = quickAddAuthor.trim();
    if (!title || !author) {
      setQuickAddError("Vnesi naslov in avtorja.");
      return;
    }
    setQuickAddBusy(true);
    setQuickAddError(null);
    const { error } = await supabase.from("queued_songs").insert({ title, author });
    setQuickAddBusy(false);
    if (error) {
      setQuickAddError(error.message);
      return;
    }
    closeQuickAdd();
  }

  async function handleAddToJam(song: Song) {
    const jamAddedAt = new Date().toISOString();
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, jam_added_at: jamAddedAt, jam_played: false } : x)));
    setJamPickerOpen(false);
    setJamPickerQuery("");
    await supabase.from("songs").update({ jam_added_at: jamAddedAt, jam_played: false }).eq("id", song.id);
  }

  async function handleToggleJamPlayed(song: Song) {
    const nextPlayed = !song.jam_played;
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, jam_played: nextPlayed } : x)));
    await supabase.from("songs").update({ jam_played: nextPlayed }).eq("id", song.id);
  }

  async function handleRemoveFromJam(song: Song) {
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, jam_added_at: null, jam_played: false } : x)));
    await supabase.from("songs").update({ jam_added_at: null, jam_played: false }).eq("id", song.id);
  }

  // "Skladbe ni" — hiter vnos naslova/avtorja, ki gre samo v Jam (ločena
  // tabela jam_extras), ne v glavno knjižnico songs.
  async function handleAddJamExtra() {
    const title = jamQuickAddTitle.trim();
    const author = jamQuickAddAuthor.trim();
    if (!title || !author) {
      setJamQuickAddError("Naslov in avtor sta obvezna.");
      return;
    }
    const { data, error } = await supabase
      .from("jam_extras")
      .insert({ title, author })
      .select()
      .single();
    if (error || !data) {
      setJamQuickAddError(error?.message ?? "Napaka pri dodajanju.");
      return;
    }
    setJamExtras((s) => [...s, data as JamExtra]);
    setJamQuickAddOpen(false);
    setJamQuickAddTitle("");
    setJamQuickAddAuthor("");
    setJamQuickAddError(null);
  }

  async function handleToggleJamExtraPlayed(extra: JamExtra) {
    const nextPlayed = !extra.played;
    setJamExtras((s) => s.map((x) => (x.id === extra.id ? { ...x, played: nextPlayed } : x)));
    await supabase.from("jam_extras").update({ played: nextPlayed }).eq("id", extra.id);
  }

  async function handleRemoveJamExtra(extra: JamExtra) {
    setJamExtras((s) => s.filter((x) => x.id !== extra.id));
    await supabase.from("jam_extras").delete().eq("id", extra.id);
  }

  async function handleAddToGoal(song: Song) {
    const goalAddedAt = new Date().toISOString();
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, goal_added_at: goalAddedAt, goal_learned: false } : x)));
    setGoalPickerOpen(false);
    setGoalPickerQuery("");
    await supabase.from("songs").update({ goal_added_at: goalAddedAt, goal_learned: false }).eq("id", song.id);
  }

  async function handleToggleGoalLearned(song: Song) {
    const nextLearned = !song.goal_learned;
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, goal_learned: nextLearned } : x)));
    await supabase.from("songs").update({ goal_learned: nextLearned }).eq("id", song.id);
  }

  async function handleRemoveFromGoal(song: Song) {
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, goal_added_at: null, goal_learned: false } : x)));
    await supabase.from("songs").update({ goal_added_at: null, goal_learned: false }).eq("id", song.id);
  }

  // "Skladbe ni" na seznamu "Mojih 20" — enak vzorec kot handleAddJamExtra.
  async function handleAddGoalExtra() {
    const title = goalQuickAddTitle.trim();
    const author = goalQuickAddAuthor.trim();
    if (!title || !author) {
      setGoalQuickAddError("Naslov in avtor sta obvezna.");
      return;
    }
    const { data, error } = await supabase
      .from("goal_extras")
      .insert({ title, author })
      .select()
      .single();
    if (error || !data) {
      setGoalQuickAddError(error?.message ?? "Napaka pri dodajanju.");
      return;
    }
    setGoalExtras((s) => [...s, data as GoalExtra]);
    setGoalQuickAddOpen(false);
    setGoalQuickAddTitle("");
    setGoalQuickAddAuthor("");
    setGoalQuickAddError(null);
  }

  async function handleToggleGoalExtraLearned(extra: GoalExtra) {
    const nextLearned = !extra.learned;
    setGoalExtras((s) => s.map((x) => (x.id === extra.id ? { ...x, learned: nextLearned } : x)));
    await supabase.from("goal_extras").update({ learned: nextLearned }).eq("id", extra.id);
  }

  async function handleRemoveGoalExtra(extra: GoalExtra) {
    setGoalExtras((s) => s.filter((x) => x.id !== extra.id));
    await supabase.from("goal_extras").delete().eq("id", extra.id);
  }

  // Sistemski gumb "Nazaj" (Android) naj se za te poglede obnaša enako kot
  // klik na njihov obstoječi gumb za zapiranje/nazaj (glej
  // src/lib/useBackableOpen.ts).
  useBackableOpen(filters.eras.length > 0 || filters.genres.length > 0 || Boolean(authorFilter), handleBackFromFilter);
  useBackableOpen(activeView !== "list", () => setActiveView("list"));
  useBackableOpen(showForm || editing !== null, closeForm);
  useBackableOpen(addChoiceOpen, () => setAddChoiceOpen(false));
  useBackableOpen(quickAddOpen, closeQuickAdd);
  useBackableOpen(jamOpen, () => setJamOpen(false));
  useBackableOpen(jamPickerOpen, () => setJamPickerOpen(false));
  useBackableOpen(goalOpen, () => setGoalOpen(false));
  useBackableOpen(goalPickerOpen, () => setGoalPickerOpen(false));

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

  // "Popularno" šteje klike na gumba "UG Tabs" in "PDF akordi" (glej
  // SongCard.tsx, onChordsClick) — ne več klik na kartico.
  async function handleChordsClick(song: Song) {
    const nextCount = (song.copy_count ?? 0) + 1;
    setSongs((s) => s.map((x) => (x.id === song.id ? { ...x, copy_count: nextCount } : x)));
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
        {jamOpen ? (
          <>
            <h1 className="flex items-center gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 shrink-0 text-fuchsia-600 dark:text-fuchsia-400"
              >
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Bitne Jam!
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setJamOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-fuchsia-600 dark:text-neutral-300 dark:hover:text-fuchsia-400"
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
                <path d="m15 18-6-6 6-6" />
              </svg>
              Nazaj
            </button>
          </>
        ) : goalOpen ? (
          <>
            <h1 className="flex items-center gap-2">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Mojih 20 skladb
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setGoalOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-amber-600 dark:text-neutral-300 dark:hover:text-amber-400"
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
                <path d="m15 18-6-6 6-6" />
              </svg>
              Nazaj
            </button>
          </>
        ) : (
          <>
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
                <span
                  className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]"
                >
                  Bitne Tabs
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (quickAddOpen) {
                    closeQuickAdd();
                  } else if (showForm || editing) {
                    closeForm();
                  } else if (addChoiceOpen) {
                    setAddChoiceOpen(false);
                  } else {
                    setEditing(null);
                    setPrefillDraft(null);
                    setAddChoiceOpen(true);
                  }
                }}
                disabled={!isSupabaseConfigured}
                aria-label="Dodaj skladbo"
                title="Dodaj skladbo"
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-500/50 bg-transparent p-2.5 text-emerald-600 transition hover:bg-emerald-500/10 disabled:opacity-40 lg:px-4 lg:py-2 dark:border-emerald-400/50 dark:text-emerald-400"
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
                <span className="hidden text-sm font-medium lg:inline">Dodaj nov komad</span>
              </button>
              <div className="ml-1.5">
                <SettingsMenu
                  onImported={(imported) => setSongs((prev) => [...imported, ...prev])}
                  onOpenGoal={() => {
                    setJamOpen(false);
                    setGoalOpen(true);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </header>

      {jamOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          {jamPickerOpen ? (
            <div className="space-y-3">
              <input
                autoFocus
                value={jamPickerQuery}
                onChange={(e) => setJamPickerQuery(e.target.value)}
                placeholder="Išči po naslovu ali avtorju…"
                className="w-full rounded-full border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] px-4 py-2 text-sm text-neutral-800 placeholder-neutral-500 transition focus:outline-none dark:border-fuchsia-400/40 dark:text-neutral-200 dark:placeholder-neutral-500"
              />
              {jamPickerQuery.trim() && jamPickerResults.length === 0 && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Ni zadetkov.</p>
              )}
              <div className="space-y-1.5">
                {jamPickerResults.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleAddToJam(song)}
                    className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-fuchsia-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-fuchsia-400"
                  >
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{song.title}</span>
                    <span className="text-neutral-500 dark:text-neutral-400"> — {song.author}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setJamPickerOpen(false);
                  setJamPickerQuery("");
                }}
                className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Prekliči
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJamPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.24)_15%,rgba(192,38,211,0.06)_95%)] dark:border-fuchsia-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.32)_15%,rgba(192,38,211,0.1)_95%)]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Dodaj skladbo v Jam
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setJamQuickAddOpen(true);
                    setJamQuickAddError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-fuchsia-500 hover:text-fuchsia-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-fuchsia-400 dark:hover:text-fuchsia-400"
                >
                  Skladbe ni
                </button>
              </div>

              {jamQuickAddOpen && (
                <div className="space-y-2 rounded-lg border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] p-3 dark:border-fuchsia-400/40">
                  <input
                    autoFocus
                    value={jamQuickAddTitle}
                    onChange={(e) => setJamQuickAddTitle(e.target.value)}
                    placeholder="Naslov skladbe"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                  />
                  <input
                    value={jamQuickAddAuthor}
                    onChange={(e) => setJamQuickAddAuthor(e.target.value)}
                    placeholder="Avtor"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                  />
                  {jamQuickAddError && <p className="text-sm text-red-600 dark:text-red-400">{jamQuickAddError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAddJamExtra}
                      className="rounded-full bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500"
                    >
                      Potrdi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJamQuickAddOpen(false);
                        setJamQuickAddTitle("");
                        setJamQuickAddAuthor("");
                        setJamQuickAddError(null);
                      }}
                      className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    >
                      Prekliči
                    </button>
                  </div>
                </div>
              )}

              {jamItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">Jam je še prazen.</p>
              ) : (
                <div className="space-y-3">
                  {jamItems.map((item, i) => (
                    <Fragment key={item.key}>
                      {item.key === firstUnplayedJamKey && (
                        <p className="flex items-center gap-1.5 pl-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          Trenutna skladba
                        </p>
                      )}
                      {item.key === secondUnplayedJamKey && (
                        <p className="flex items-center gap-1.5 pl-1 text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                          Naslednja skladba
                        </p>
                      )}
                      <div
                        className={`flex items-center gap-3 rounded-full border bg-white px-4 py-2 dark:bg-neutral-900 ${
                          item.key === firstUnplayedJamKey
                            ? "border-emerald-400 dark:border-emerald-600"
                            : "border-neutral-200 dark:border-neutral-800"
                        }`}
                      >
                        <span
                          className={`w-6 shrink-0 text-right text-lg font-semibold ${
                            item.key === secondUnplayedJamKey
                              ? "text-sky-600 dark:text-sky-400"
                              : item.played
                                ? "text-neutral-300 dark:text-neutral-700"
                                : "text-neutral-400 dark:text-neutral-600"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <input
                          type="checkbox"
                          checked={item.played}
                          onChange={() =>
                            item.kind === "song"
                              ? handleToggleJamPlayed(item.song)
                              : handleToggleJamExtraPlayed(item.extra)
                          }
                          className="h-4 w-4 shrink-0 rounded border-neutral-300 text-fuchsia-600 focus:ring-fuchsia-500 dark:border-neutral-700 dark:bg-neutral-800"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm font-medium ${
                              item.played
                                ? "text-neutral-400 line-through dark:text-neutral-600"
                                : "text-neutral-900 dark:text-neutral-100"
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{item.author}</p>
                        </div>
                        {item.kind === "song" && (
                          <ChordsButtons song={item.song} onChordsClick={handleChordsClick} stacked />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            item.kind === "song" ? handleRemoveFromJam(item.song) : handleRemoveJamExtra(item.extra)
                          }
                          aria-label="Odstrani iz Jama"
                          title="Odstrani iz Jama"
                          className="shrink-0 p-1 text-neutral-400 hover:text-red-600 dark:text-neutral-500 dark:hover:text-red-400"
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : goalOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          {goalPickerOpen ? (
            <div className="space-y-3">
              <input
                autoFocus
                value={goalPickerQuery}
                onChange={(e) => setGoalPickerQuery(e.target.value)}
                placeholder="Išči po naslovu ali avtorju…"
                className="w-full rounded-full border border-amber-500/40 bg-[linear-gradient(115deg,rgba(217,119,6,0.14)_15%,rgba(217,119,6,0.03)_95%)] px-4 py-2 text-sm text-neutral-800 placeholder-neutral-500 transition focus:outline-none dark:border-amber-400/40 dark:text-neutral-200 dark:placeholder-neutral-500"
              />
              {goalPickerQuery.trim() && goalPickerResults.length === 0 && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Ni zadetkov.</p>
              )}
              <div className="space-y-1.5">
                {goalPickerResults.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleAddToGoal(song)}
                    className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-amber-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-amber-400"
                  >
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{song.title}</span>
                    <span className="text-neutral-500 dark:text-neutral-400"> — {song.author}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setGoalPickerOpen(false);
                  setGoalPickerQuery("");
                }}
                className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                Prekliči
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGoalPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-[linear-gradient(115deg,rgba(217,119,6,0.14)_15%,rgba(217,119,6,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(217,119,6,0.24)_15%,rgba(217,119,6,0.06)_95%)] dark:border-amber-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(217,119,6,0.32)_15%,rgba(217,119,6,0.1)_95%)]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Dodaj skladbo na seznam
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGoalQuickAddOpen(true);
                    setGoalQuickAddError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-amber-500 hover:text-amber-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-amber-400 dark:hover:text-amber-400"
                >
                  Skladbe ni
                </button>
              </div>

              {goalQuickAddOpen && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-[linear-gradient(115deg,rgba(217,119,6,0.14)_15%,rgba(217,119,6,0.03)_95%)] p-3 dark:border-amber-400/40">
                  <input
                    autoFocus
                    value={goalQuickAddTitle}
                    onChange={(e) => setGoalQuickAddTitle(e.target.value)}
                    placeholder="Naslov skladbe"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                  />
                  <input
                    value={goalQuickAddAuthor}
                    onChange={(e) => setGoalQuickAddAuthor(e.target.value)}
                    placeholder="Avtor"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
                  />
                  {goalQuickAddError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{goalQuickAddError}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAddGoalExtra}
                      className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
                    >
                      Potrdi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGoalQuickAddOpen(false);
                        setGoalQuickAddTitle("");
                        setGoalQuickAddAuthor("");
                        setGoalQuickAddError(null);
                      }}
                      className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    >
                      Prekliči
                    </button>
                  </div>
                </div>
              )}

              {goalItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Seznam je še prazen.
                </p>
              ) : (
                <div className="space-y-3">
                  {goalItems.map((item, i) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <span
                        className={`w-6 shrink-0 text-right text-lg font-semibold ${
                          item.learned
                            ? "text-neutral-300 dark:text-neutral-700"
                            : "text-neutral-400 dark:text-neutral-600"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <input
                        type="checkbox"
                        checked={item.learned}
                        onChange={() =>
                          item.kind === "song"
                            ? handleToggleGoalLearned(item.song)
                            : handleToggleGoalExtraLearned(item.extra)
                        }
                        className="h-4 w-4 shrink-0 rounded border-neutral-300 text-amber-600 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-800"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            item.learned
                              ? "text-neutral-400 line-through dark:text-neutral-600"
                              : "text-neutral-900 dark:text-neutral-100"
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{item.author}</p>
                      </div>
                      {item.kind === "song" && (
                        <ChordsButtons song={item.song} onChordsClick={handleChordsClick} stacked />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          item.kind === "song" ? handleRemoveFromGoal(item.song) : handleRemoveGoalExtra(item.extra)
                        }
                        aria-label="Odstrani s seznama"
                        title="Odstrani s seznama"
                        className="shrink-0 p-1 text-neutral-400 hover:text-red-600 dark:text-neutral-500 dark:hover:text-red-400"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
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
            onAddSimilar={handleAddSimilar}
            onFilterAuthor={handleFilterByAuthor}
            onAddToJam={handleAddToJam}
            onChordsClick={handleChordsClick}
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

      {addChoiceOpen && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dodaj skladbo</h2>
            <button
              type="button"
              onClick={() => setAddChoiceOpen(false)}
              className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Zapri ✕
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setAddChoiceOpen(false);
                setQuickAddOpen(true);
              }}
              className="flex flex-col items-start gap-1.5 rounded-xl border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] p-4 text-left transition hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.24)_15%,rgba(192,38,211,0.06)_95%)] dark:border-fuchsia-400/40 dark:hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.32)_15%,rgba(192,38,211,0.1)_95%)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0 text-fuchsia-600 dark:text-fuchsia-400"
              >
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">Hitro</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Samo naslov in avtor — za hiter predlog v čakalno vrsto.
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddChoiceOpen(false);
                setEditing(null);
                setPrefillDraft(null);
                setShowForm(true);
              }}
              className="flex flex-col items-start gap-1.5 rounded-xl border border-emerald-500/40 bg-[linear-gradient(115deg,rgba(16,185,129,0.14)_15%,rgba(16,185,129,0.03)_95%)] p-4 text-left transition hover:bg-[linear-gradient(115deg,rgba(16,185,129,0.24)_15%,rgba(16,185,129,0.06)_95%)] dark:border-emerald-400/40 dark:hover:bg-[linear-gradient(115deg,rgba(16,185,129,0.32)_15%,rgba(16,185,129,0.1)_95%)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              >
                <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">Prek telefona</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Celoten obrazec z vsemi podatki (žanr, obdobje, akordi …).
              </span>
            </button>
          </div>
        </div>
      )}

      {quickAddOpen && (
        <div
          id="quick-add-form"
          className="rounded-xl border border-fuchsia-500/40 bg-white p-5 space-y-3 dark:border-fuchsia-400/40 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Hitro dodaj skladbo</h2>
            <button
              type="button"
              onClick={closeQuickAdd}
              className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Zapri ✕
            </button>
          </div>
          <input
            autoFocus
            value={quickAddTitle}
            onChange={(e) => setQuickAddTitle(e.target.value)}
            placeholder="Naslov skladbe"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
          />
          <input
            value={quickAddAuthor}
            onChange={(e) => setQuickAddAuthor(e.target.value)}
            placeholder="Avtor"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
          />
          {quickAddError && <p className="text-sm text-red-600 dark:text-red-400">{quickAddError}</p>}
          <button
            type="button"
            onClick={handleConfirmQuickAdd}
            disabled={quickAddBusy}
            className="rounded-full bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {quickAddBusy ? "Dodajam…" : "Potrdi"}
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

      <div className="space-y-2.5 lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:space-y-0">
        <div className="flex items-center gap-2 lg:contents">
          <div className="relative w-1/2 lg:max-w-xs lg:flex-none">
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
              className="w-full rounded-full border border-rose-500/40 bg-[linear-gradient(115deg,rgba(225,29,72,0.14)_15%,rgba(225,29,72,0.03)_95%)] py-2 pl-10 pr-9 text-sm text-neutral-800 placeholder-neutral-500 transition focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.24)_15%,rgba(225,29,72,0.06)_95%)] focus:outline-none disabled:opacity-40 dark:border-rose-400/40 dark:text-neutral-200 dark:placeholder-neutral-500 dark:focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.32)_15%,rgba(225,29,72,0.1)_95%)]"
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

          <button
            type="button"
            onClick={() => {
              setJamOpen((v) => !v);
              setGoalOpen(false);
            }}
            disabled={!isSupabaseConfigured}
            aria-pressed={jamOpen}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-fuchsia-500/40 px-4 py-2 text-sm font-medium transition disabled:opacity-40 dark:border-fuchsia-400/40 ${
              jamOpen
                ? "bg-[linear-gradient(115deg,#a21caf_15%,#e879f9_100%)] text-white"
                : "bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] text-neutral-800 hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.24)_15%,rgba(192,38,211,0.06)_95%)] dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.32)_15%,rgba(192,38,211,0.1)_95%)]"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 ${jamOpen ? "text-white" : "text-fuchsia-600 dark:text-fuchsia-400"}`}
            >
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Jam
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto lg:contents">
          <button
            type="button"
            onClick={pickRandom}
            disabled={!isSupabaseConfigured}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-500/40 bg-[linear-gradient(115deg,rgba(124,58,237,0.14)_15%,rgba(124,58,237,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(124,58,237,0.24)_15%,rgba(124,58,237,0.06)_95%)] disabled:opacity-40 dark:border-violet-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(124,58,237,0.32)_15%,rgba(124,58,237,0.1)_95%)]"
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-600/40 bg-[linear-gradient(115deg,rgba(8,145,178,0.14)_15%,rgba(8,145,178,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(8,145,178,0.24)_15%,rgba(8,145,178,0.06)_95%)] disabled:opacity-40 dark:border-cyan-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(8,145,178,0.32)_15%,rgba(8,145,178,0.1)_95%)]"
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

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto lg:contents">
          <button
            type="button"
            data-view-toggle
            onClick={() => setActiveView((v) => (v === "newest" ? "list" : "newest"))}
            disabled={!isSupabaseConfigured}
            aria-pressed={activeView === "newest"}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/50 px-4 py-2 text-sm font-medium transition disabled:opacity-40 dark:border-emerald-400/50 ${
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-500/50 px-4 py-2 text-sm font-medium transition disabled:opacity-40 dark:border-orange-400/50 ${
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
          <div className="mt-3">
            <FeaturedArtists
              items={featuredArtists}
              onFilterAuthor={handleFilterByAuthor}
              onChordsClick={handleChordsClick}
            />
          </div>
          <HighlightRow
            title="Avtorji"
            items={authorHighlights}
            onSelect={handleFilterByAuthor}
            images={authorImages}
            accentForLabel={authorAccentHex}
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
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Nedavno dodano
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {recentTop.map((song) => (
                    <CompactCard key={song.id} song={song} onChordsClick={handleChordsClick} />
                  ))}
                </div>
              </div>

              {newByAuthor.length > 0 && (
                <RecentGroupSection
                  title="Novo po avtorjih"
                  groups={newByAuthor}
                  onChordsClick={handleChordsClick}
                  accentOffset={0}
                />
              )}
              {newByEra.length > 0 && (
                <RecentGroupSection
                  title="Novo po obdobju"
                  groups={newByEra}
                  onChordsClick={handleChordsClick}
                  formatLabel={formatEraLabel}
                  accentOffset={3}
                />
              )}
              {newByMood.length > 0 && (
                <RecentGroupSection
                  title="Novo po razpoloženju"
                  groups={newByMood}
                  onChordsClick={handleChordsClick}
                  accentOffset={5}
                />
              )}
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
                <CompactRow key={song.id} song={song} rank={i + 1} onChordsClick={handleChordsClick} highlighted />
              ))}
              {mostPopular.slice(5).map((song, i) => (
                <CompactRow key={song.id} song={song} rank={i + 6} onChordsClick={handleChordsClick} />
              ))}
            </div>
          )
        )}

        {!loading && !loadError && activeView === "list" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                {songsHeading}
              </h2>
              {filters.eras.length > 0 || filters.genres.length > 0 || authorFilter ? (
                <button
                  type="button"
                  onClick={handleBackFromFilter}
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

            {(songsVisible || hasActiveFilters(filters)) && (
              <>
                {displaySongs.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    {songs.length === 0
                      ? "Baza je še prazna — dodaj prvo skladbo."
                      : "Nobena skladba ne ustreza izbranim filtrom."}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displaySongs.map((song) => (
                    <div key={song.id}>
                      <SongCard
                        song={song}
                        authorImage={authorImages[song.author] ?? null}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onAddSimilar={handleAddSimilar}
                        onFilterAuthor={handleFilterByAuthor}
                        onAddToJam={handleAddToJam}
                        onChordsClick={handleChordsClick}
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
        </>
      )}
    </div>
  );
}

function CompactCard({ song, onChordsClick }: { song: Song; onChordsClick?: (song: Song) => void }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 transition hover:-translate-y-0.5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
      <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{song.author}</p>
      <ChordsButtons song={song} onChordsClick={onChordsClick} />
    </div>
  );
}

function CompactRow({
  song,
  rank,
  onChordsClick,
  highlighted = false,
}: {
  song: Song;
  rank: number;
  onChordsClick?: (song: Song) => void;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-start gap-3 border p-3 transition hover:-translate-y-0.5 ${
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
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{song.author}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ChordsButtons song={song} onChordsClick={onChordsClick} stacked merged />
        <span
          title="Kolikokrat je bila kliknjena UG Tabs ali PDF akordi povezava"
          className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500"
        >
          {song.copy_count}×
        </span>
      </div>
    </div>
  );
}

function RecentGroupSection({
  title,
  groups,
  onChordsClick,
  formatLabel = (label) => label,
  accentOffset = 0,
}: {
  title: string;
  groups: RecentGroup[];
  onChordsClick?: (song: Song) => void;
  formatLabel?: (label: string) => string;
  accentOffset?: number;
}) {
  const titleAccent = ACCENTS[accentOffset % ACCENTS.length];
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold" style={{ color: titleAccent }}>
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group, i) => {
          const accent = ACCENTS[(accentOffset + i) % ACCENTS.length];
          return (
            <div
              key={group.label}
              style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
              className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <p className="mb-1.5 truncate text-sm font-semibold" style={{ color: accent }}>
                {formatLabel(group.label)}
              </p>
              <div className="space-y-0.5">
                {group.songs.map((song) => (
                  <RecentGroupSongRow key={song.id} song={song} onChordsClick={onChordsClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentGroupSongRow({
  song,
  onChordsClick,
}: {
  song: Song;
  onChordsClick?: (song: Song) => void;
}) {
  return (
    <div className="flex w-full flex-col items-start rounded-lg px-1.5 py-1 text-left">
      <span className="w-full truncate text-sm text-neutral-800 dark:text-neutral-200">{song.title}</span>
      <span className="w-full truncate text-xs text-neutral-500 dark:text-neutral-400">{song.author}</span>
      <ChordsButtons song={song} onChordsClick={onChordsClick} />
    </div>
  );
}
