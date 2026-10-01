"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import ChordsButtons from "@/components/ChordsButtons";
import JamBoard, { type JamBoardItem } from "@/components/JamBoard";
import { fullNameFor, initialsOf } from "@/lib/userName";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { dedupeShared, importSharedSongs, songMatchKey } from "@/lib/importShared";
import Filters, { FiltersToggle } from "@/components/Filters";
import FeaturedArtists from "@/components/FeaturedArtists";
import HomeHighlights, {
  ACCENTS,
  formatEraLabel,
  HighlightRow,
} from "@/components/HomeHighlights";
import SettingsMenu from "@/components/SettingsMenu";
import SortMenu, { SONG_SORTS } from "@/components/SortMenu";
import SongCard from "@/components/SongCard";
import SongForm from "@/components/SongForm";
import ChordsViewer from "@/components/ChordsViewer";
import JamArchive from "@/components/JamArchive";
import Playlists from "@/components/Playlists";
import VoiceQuickAdd from "@/components/VoiceQuickAdd";
import AddChoiceIcons from "@/components/AddChoiceIcons";
import ChordsTextEditor from "@/components/ChordsTextEditor";
import { ImportHistory, ImportReports } from "@/components/ImportTabs";
import { FavoritesArchive, FavoritesThisMonth, VerifiedSongs, favoriteArchiveMonths } from "@/components/FavoritesMonth";
import { authorAccentHex } from "@/lib/authorColor";
import { DEFAULT_MOODS, DEFAULT_ORIGINS, ERAS, GENRES } from "@/lib/constants";
import { pickDailyFeatured } from "@/lib/dailyRandom";
import {
  emptyFilters,
  hasActiveFilters,
  type FilterState,
} from "@/lib/filters";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { usePersistentBool } from "@/lib/usePersistentBool";
import { usePersistentString } from "@/lib/usePersistentString";
import { closeChordsViewer, openChordsViewer, useOpenChordsMode, useOpenChordsSongId } from "@/lib/openChords";
import {
  SHARED_VIEW_HEARTBEAT_MS,
  SHARED_VIEW_STALE_MS,
  publishRemoteView,
  type LocalView,
  type SharedViewMessage,
} from "@/lib/sharedChordsView";
import type { SharedViewProp } from "@/components/ChordsViewer";
import type {
  GoalExtra,
  JamExtra,
  SimilarSong,
  Song,
  SongReport,
  QueuedSong,
  ImportBatch,
  JamHistoryEntry,
  SharedJamItem,
} from "@/types/song";

const QUEUE_TABS = ["queue", "reports", "history"] as const;
const SONGS_VISIBLE_VALUES = ["unset", "1", "0"] as const;
// Največ toliko zadetkov iskanja/filtrov naenkrat (glej visibleResults).
const RESULTS_PAGE = 40;
const QUEUE_TAB_LABELS: Record<(typeof QUEUE_TABS)[number], string> = {
  queue: "Čakalna vrsta",
  reports: "Poročila",
  history: "Zgodovina dodajanja",
};

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
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return {
        label,
        latest: new Date(sorted[0].created_at).getTime(),
        songs: sorted.slice(0, songsPerGroup),
      };
    })
    .sort((a, b) => b.latest - a.latest)
    .slice(0, maxGroups)
    .map(({ label, songs }) => ({ label, songs }));
}

export default function Dashboard({ user }: { user: User }) {
  // allSongs = vse moje vrstice; `songs` (knjižnica, vsi ostali pogledi) brez
  // tistih, ki še čakajo na "Pregled in odobritev" (review_pending, dodal jih
  // je skill dodaj-iz-cakalne-vrste). setSongs vedno dela na allSongs.
  const [allSongs, setSongs] = useState<Song[]>([]);
  const songs = useMemo(() => allSongs.filter((s) => !s.review_pending), [allSongs]);
  const reviewSongs = useMemo(
    () =>
      allSongs
        .filter((s) => s.review_pending)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allSongs],
  );
  const [reviewOpen, setReviewOpen] = usePersistentBool("komadi:review:open", false);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  // Pregled in odobritev: kartice z razprtimi nastavitvami pod kartico (privzeto pospravljene).
  const [reviewExpanded, setReviewExpanded] = useState<Set<string>>(new Set());
  const toggleReviewExpanded = (id: string) =>
    setReviewExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [reviewError, setReviewError] = useState<string | null>(null);
  // "Skupno": skladbe drugih uporabnikov (select na songs je odprt za vse
  // prijavljene, glej 0029_add_user_accounts.sql), naložene ob prvem vklopu.
  // Iz njih si uporabnik skladbe uvozi v svojo knjižnico.
  const [sharedOn, setSharedOn] = usePersistentBool("komadi:shared:open", false);
  const [sharedSongs, setSharedSongs] = useState<Song[] | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [authorImages, setAuthorImages] = useState<Record<string, string>>({});
  // Prijave napak (tabela song_reports, gumb "Prijavi napako" v SongCard.tsx).
  // Skladbe z odprto prijavo so skrite iz seznama "Vsi Komadi" in prikazane
  // na strani "Popravi skladbe" (fixOpen), dokler prijava ni označena kot
  // popravljena (tam ali v hitrem pregledu v SettingsMenu.tsx).
  const [reports, setReports] = useState<SongReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  // Urejanje opisa posamezne prijave na strani "Popravi skladbe".
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  // Skladba, pri kateri čaka potrditev "Je bila skladba res popravljena?".
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);
  // Napredni urejevalnik besedila z akordi ("Uredi besedilo" na strani Popravi skladbe).
  const [chordsEditSong, setChordsEditSong] = useState<Song | null>(null);
  // Urejevalnik odprt iz pregledovalnika akordov (gumb "Urejevalnik"): ob
  // zaprtju se pregledovalnik spet odpre, z novim besedilom.
  const [editorFromViewer, setEditorFromViewer] = useState(false);
  // "Čakalna vrsta" (tabela queued_songs, gumb "Hitro" ob "Dodaj skladbo"):
  // hiter pregled v SettingsMenu.tsx + celostranski pogled (queueOpen).
  const [queuedSongs, setQueuedSongs] = useState<QueuedSong[]>([]);
  const [queuedError, setQueuedError] = useState<string | null>(null);
  // Vnos v čakalni vrsti, za katerega je odprt obrazec "Dodaj v knjižnico" —
  // po uspešnem shranjevanju se ta vnos odstrani iz čakalne vrste.
  const [queueAddingId, setQueueAddingId] = useState<string | null>(null);
  const [confirmRemoveQueuedId, setConfirmRemoveQueuedId] = useState<string | null>(null);
  // Zavihki strani "Čakalna vrsta": seznam, poročila uvozov in zgodovina
  // dodajanja (uvozi = tabela import_batches, glej ImportTabs.tsx).
  const [queueTab, setQueueTab] = usePersistentString("komadi:queue:tab", "queue", QUEUE_TABS);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [importBatchesError, setImportBatchesError] = useState<string | null>(null);
  const reportedSongIds = useMemo(
    () => new Set(reports.map((r) => r.song_id)),
    [reports],
  );
  // Prijave, združene po skladbi (vrstni red: najstarejša prijava prva).
  const fixItems = useMemo(() => {
    const bySong = new Map<string, SongReport[]>();
    for (const r of reports)
      bySong.set(r.song_id, [...(bySong.get(r.song_id) ?? []), r]);
    return [...bySong].flatMap(([songId, songReports]) => {
      const song = songs.find((s) => s.id === songId);
      return song ? [{ song, songReports }] : [];
    });
  }, [reports, songs]);
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
  // "Glasovno": naslov in izvajalca narekuješ, nato se odpre obrazec "Hitro".
  const [voiceAddOpen, setVoiceAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddAuthor, setQuickAddAuthor] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [defaultSongsVisible, setDefaultSongsVisible] = useState(true);
  // Na namizju (lg) je seznam vseh skladb privzeto skrit — na mobilnem
  // ostane viden (podatek o širini zaslona ni na voljo pred hidracijo, zato
  // to preveri šele po prvem izrisu).
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches)
      setDefaultSongsVisible(false);
  }, []);
  // Izbira "Prikaži"/"Skrij komade" se zapomni (localStorage) in preživi
  // osvežitev; dokler je uporabnik ne spremeni, velja privzeto zgoraj.
  const [storedSongsVisible, setStoredSongsVisible] = usePersistentString(
    "komadi:songs:visible",
    "unset",
    SONGS_VISIBLE_VALUES,
  );
  const songsVisible =
    storedSongsVisible === "unset" ? defaultSongsVisible : storedSongsVisible === "1";
  const [randomPick, setRandomPick] = useState<Song | null>(null);
  const [activeView, setActiveView] = useState<"list" | "newest" | "popular">(
    "list",
  );
  // Obstojno stanje (localStorage), da osvežitev strani med jam sessionom ne
  // vrže nazaj na domačo stran — glej usePersistentBool.
  const [jamOpen, setJamOpen] = usePersistentBool("komadi:jam:open", false);
  // Telefon: med iskanjem (fokus ali vpisano besedilo) se iskalno polje
  // razširi čez prosti prostor, gumba Jam/Playliste pa skrčita v ikoni.
  const [searchFocused, setSearchFocused] = useState(false);
  // Naslovna vrstica seznama "Vsi Komadi" — cilj gumba "Vrni se na vrh".
  const listHeadingRef = useRef<HTMLDivElement>(null);
  const searchWide = searchFocused || filters.search !== "";
  // "Akordi v aplikaciji": odprta skladba je v localStorage (src/lib/openChords.ts),
  // da po osvežitvi ostane odprta; pregledovalnik se izriše samo tu.
  const openChordsId = useOpenChordsSongId();
  // "samspili" = pregledovalnik se odpre v pogledu "Sam Špili" (3 vrstice).
  const openChordsMode = useOpenChordsMode();
  // Seznam skladb se riše po RESULTS_PAGE kartic, naslednje ob pomiku do dna
  // (LoadMoreSentinel). Brez tega je vsaka od prvih črk v iskanju (ujema se
  // skoraj vseh ~290 skladb) in brisanje zadnje črke (spet cel seznam)
  // izrisalo vse kartice in tipkanje/brisanje je zaostajalo. Ob vsaki
  // spremembi filtrov spet od začetka; "← Nazaj" (handleBackFromFilter) pa
  // nariše cel seznam, da se lahko vrne na prejšnji položaj.
  const [resultsPage, setResultsPage] = useState({ key: "", count: RESULTS_PAGE });
  const filtersKey = JSON.stringify(filters);
  const visibleResults = resultsPage.key === filtersKey ? resultsPage.count : RESULTS_PAGE;
  // Arhiv Jama (tabela jam_history): gumb "Arhiv" na sredini glave, ko je
  // Jam odprt; pod črto nato namesto trenutnega Jama pokaže pretekle.
  const [jamArchiveOpen, setJamArchiveOpen] = useState(false);
  const [jamHistory, setJamHistory] = useState<JamHistoryEntry[]>([]);
  const [jamHistoryError, setJamHistoryError] = useState<string | null>(null);
  const [jamExtras, setJamExtras] = useState<JamExtra[]>([]);
  // "Skupni Jam" (tabela shared_jam_items): ena vrsta za vse uporabnike, zavihek
  // levo od "Arhiv". sharedJamSongs = skladbe drugih uporabnikov, na katere kaže.
  const [jamShared, setJamShared] = usePersistentBool("komadi:jam:shared", false);
  const [sharedJamItems, setSharedJamItems] = useState<SharedJamItem[]>([]);
  const [sharedJamSongs, setSharedJamSongs] = useState<Record<string, Song>>({});
  // "Preverjeno špila" (domača stran) je za vse enak: preverjene, odobrene
  // skladbe vseh uporabnikov (select na songs je odprt vsem prijavljenim),
  // naložene ob odprtju; lastne pridejo iz songs (sproti), tuje brez podvojitev.
  const [verifiedAll, setVerifiedAll] = useState<Song[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("songs")
      .select("*")
      .not("verified_player_at", "is", null)
      .eq("review_pending", false)
      .then(({ data }) => {
        if (!cancelled && data) setVerifiedAll(data as Song[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // "Priljubljeno <mesec>" → "Drugi": priljubljene (odobrene) skladbe drugih
  // uporabnikov + njihova imena (RPC song_owner_names, 0036), naložene ob odprtju.
  const [othersFavorites, setOthersFavorites] = useState<Song[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("songs")
      .select("*")
      .eq("favorite", true)
      .eq("review_pending", false)
      .neq("user_id", user.id)
      .then(({ data }) => {
        if (!cancelled && data) setOthersFavorites(data as Song[]);
      });
    supabase.rpc("song_owner_names").then(({ data }) => {
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as { user_id: string; name: string | null }[]) if (row.name) map[row.user_id] = row.name;
      setOwnerNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);
  const verifiedSongs = useMemo(() => {
    const own = songs.filter((s) => s.verified_player_at);
    const ownKeys = new Set(own.map((s) => songMatchKey(s)));
    const foreign = dedupeShared(verifiedAll.filter((s) => s.user_id !== user.id && !ownKeys.has(songMatchKey(s))));
    return [...own, ...foreign];
  }, [songs, verifiedAll, user.id]);
  const [sharedJamError, setSharedJamError] = useState<string | null>(null);
  // "Mojih 20 skladb": osebni seznam za naučit do konca leta — isti vzorec
  // kot Jam (persist odprtost, iskalni izbirnik, "Skladbe ni" hitri vnos),
  // samo z own poljema (goal_added_at/goal_learned, goal_extras) in brez
  // "trenutna/naslednja" oznak, ker ne gre za živo sejo.
  const [goalOpen, setGoalOpen] = usePersistentBool("komadi:goal:open", false);
  // "Popravi skladbe": celostranski pogled s prijavljenimi skladbami (glej
  // reports zgoraj) — enak vzorec odprtosti kot Jam/Mojih 20 skladb.
  const [fixOpen, setFixOpen] = usePersistentBool("komadi:fix:open", false);
  const [queueOpen, setQueueOpen] = usePersistentBool("komadi:queue:open", false);
  // "Arhiv priljubljenih": priljubljene preteklih mesecev (FavoritesMonth.tsx).
  const [favArchiveOpen, setFavArchiveOpen] = usePersistentBool("komadi:favarchive:open", false);
  // "Playliste": poimenovani seznami skladb (Playlists.tsx, tabeli playlists/playlist_songs).
  const [playlistsOpen, setPlaylistsOpen] = usePersistentBool("komadi:playlists:open", false);
  // Isti localStorage ključ kot FiltersToggle/Filters v Filters.tsx — da lahko
  // "Počisti filtre" (glej handleBackFromFilter) zapre tudi panel s filtri.
  const [, setFiltersOpen] = usePersistentBool("komadi:filters:open", false);
  // Vrstni red seznama "Vsi Komadi" (gumb "Filter" desno od naslova, glej
  // SortMenu.tsx). Zapomnjeno čez osvežitev.
  const [songSort, setSongSort] = usePersistentString(
    "komadi:sort",
    "az",
    SONG_SORTS,
  );
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [goalPickerQuery, setGoalPickerQuery] = useState("");
  const [goalExtras, setGoalExtras] = useState<GoalExtra[]>([]);
  const [goalQuickAddOpen, setGoalQuickAddOpen] = useState(false);
  const [goalQuickAddTitle, setGoalQuickAddTitle] = useState("");
  const [goalQuickAddAuthor, setGoalQuickAddAuthor] = useState("");
  const [goalQuickAddError, setGoalQuickAddError] = useState<string | null>(
    null,
  );
  const [prefillDraft, setPrefillDraft] = useState<{
    title: string;
    author: string;
  } | null>(null);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  // Položaj skrolanja na domači strani tik pred klikom na avtorja/obdobje/
  // žanr (Obdobja, Žanri, Predstavljeno, Avtorji) — gumb "Nazaj" se vrne na
  // to mesto, namesto da bi po vrnitvi ostal na vrhu strani.
  const homeScrollY = useRef(0);

  type PartialDimension = "genre" | "author" | "era" | "mood" | "origin";
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialDimension, setPartialDimension] =
    useState<PartialDimension | null>(null);
  const [partialValue, setPartialValue] = useState("");
  const [partialError, setPartialError] = useState<string | null>(null);
  // Ali trenutni randomPick prihaja iz "Delno naključno" (izbran po merilu) —
  // v tem primeru mora "Izberi drugo" spet odpreti izbirni obrazec (isto
  // vedenje kot začetni klik na "Delno naključno"), namesto da izbere
  // popolnoma naključno skladbo iz cele baze kot pri navadnem "Naključno".
  const [randomPickFromPartial, setRandomPickFromPartial] = useState(false);
  // Seznam 5 naključnih skladb, prikazan pod trenutno naključno izbrano
  // kartico po kliku na gumb "5 ↻".
  const [randomFive, setRandomFive] = useState<Song[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      // Filter po user_id je obvezen: RLS pusti brati skladbe vseh
      // prijavljenih (zaradi "Skupno").
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .eq("user_id", user.id)
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
  }, [user.id]);

  useEffect(() => {
    if (!sharedOn || sharedSongs) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .neq("user_id", user.id)
        .eq("review_pending", false);
      if (cancelled) return;
      if (error) setSharedError(error.message);
      else setSharedSongs(dedupeShared(data as Song[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [sharedOn, sharedSongs, user.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("author_images")
        .select("author, image_url");
      if (cancelled || error || !data) return;
      setAuthorImages(
        Object.fromEntries(data.map((r) => [r.author, r.image_url])),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("song_reports")
        .select("*")
        .order("reported_at", { ascending: true });
      if (cancelled || error || !data) return;
      setReports(data as SongReport[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("queued_songs")
        .select("*")
        .order("added_at", { ascending: true });
      if (cancelled || error || !data) return;
      setQueuedSongs(data as QueuedSong[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      // Brez migracije 0021 tabela ne obstaja — zavihka to pokažeta kot napako.
      if (error) setImportBatchesError(error.message);
      else if (data) setImportBatches(data as ImportBatch[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("jam_extras")
        .select("*")
        .order("added_at", { ascending: true });
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
      const { data, error } = await supabase
        .from("goal_extras")
        .select("*")
        .order("added_at", { ascending: true });
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
      .on<Song>(
        "postgres_changes",
        // Samo lastne skladbe — RLS bi sicer pošiljal spremembe vseh uporabnikov.
        { event: "*", schema: "public", table: "songs", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const song = payload.new;
            setSongs((prev) =>
              prev.some((s) => s.id === song.id) ? prev : [song, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            // Združi, ne zamenjaj: Postgres v realtime UPDATE ne pošlje velikih
            // (TOAST) stolpcev, ki se niso spremenili — npr. chords_text ob
            // posodobitvi copy_count — in skladba bi jih sicer izgubila.
            const song = payload.new;
            setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, ...song } : s)));
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            if (id) setSongs((prev) => prev.filter((s) => s.id !== id));
          }
        },
      )
      .on<JamExtra>(
        "postgres_changes",
        { event: "*", schema: "public", table: "jam_extras" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const extra = payload.new;
            setJamExtras((prev) =>
              prev.some((x) => x.id === extra.id) ? prev : [...prev, extra],
            );
          } else if (payload.eventType === "UPDATE") {
            const extra = payload.new;
            setJamExtras((prev) =>
              prev.map((x) => (x.id === extra.id ? extra : x)),
            );
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            if (id) setJamExtras((prev) => prev.filter((x) => x.id !== id));
          }
        },
      )
      .on<GoalExtra>(
        "postgres_changes",
        { event: "*", schema: "public", table: "goal_extras" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const extra = payload.new;
            setGoalExtras((prev) =>
              prev.some((x) => x.id === extra.id) ? prev : [...prev, extra],
            );
          } else if (payload.eventType === "UPDATE") {
            const extra = payload.new;
            setGoalExtras((prev) =>
              prev.map((x) => (x.id === extra.id ? extra : x)),
            );
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            if (id) setGoalExtras((prev) => prev.filter((x) => x.id !== id));
          }
        },
      )
      .on<SharedJamItem>(
        "postgres_changes",
        { event: "*", schema: "public", table: "shared_jam_items" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const item = payload.new;
            setSharedJamItems((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item]));
          } else if (payload.eventType === "UPDATE") {
            const item = payload.new;
            setSharedJamItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...item } : x)));
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            if (id) setSharedJamItems((prev) => prev.filter((x) => x.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  async function handleSetAuthorImage(author: string, imageUrl: string | null) {
    const prev = authorImages;
    if (imageUrl) {
      setAuthorImages((m) => ({ ...m, [author]: imageUrl }));
      const { error } = await supabase
        .from("author_images")
        .upsert({ author, image_url: imageUrl });
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
      const { error } = await supabase
        .from("author_images")
        .delete()
        .eq("author", author);
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
        .sort((a, b) =>
          (a.jam_added_at ?? "").localeCompare(b.jam_added_at ?? ""),
        ),
    [songs],
  );

  // Jam prikazuje prave skladbe (jamSongs) in začasne "Skladbe ni" vnose
  // (jamExtras) v enem seznamu, razvrščenem po tem, kdaj je bil kateri dodan.
  type JamItem = {
    key: string;
    title: string;
    author: string;
    played: boolean;
  } & ({ kind: "song"; song: Song } | { kind: "extra"; extra: JamExtra });
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
  const privateBoardItems = useMemo<JamBoardItem[]>(
    () =>
      jamItems.map((item) => ({
        key: item.key,
        title: item.title,
        author: item.author,
        played: item.played,
        song: item.kind === "song" ? item.song : null,
      })),
    [jamItems],
  );
  const jamSongIds = useMemo(() => new Set(jamSongs.map((s) => s.id)), [jamSongs]);

  const goalSongs = useMemo(
    () =>
      songs
        .filter((s) => s.goal_added_at)
        .sort((a, b) =>
          (a.goal_added_at ?? "").localeCompare(b.goal_added_at ?? ""),
        ),
    [songs],
  );

  // "Mojih 20 skladb" prikazuje prave skladbe (goalSongs) in začasne
  // "Skladbe ni" vnose (goalExtras) v enem seznamu, enak vzorec kot JamItem.
  type GoalItem = {
    key: string;
    title: string;
    author: string;
    learned: boolean;
  } & ({ kind: "song"; song: Song } | { kind: "extra"; extra: GoalExtra });
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

  // V načinu "Skupno" isti filtri veljajo za skladbe drugih uporabnikov.
  const filteredSongs = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (sharedOn ? (sharedSongs ?? []) : songs).filter((s) => {
      if (q && !`${s.title} ${s.author}`.toLowerCase().includes(q))
        return false;
      if (filters.genres.length && !filters.genres.includes(s.genre))
        return false;
      if (filters.eras.length && !filters.eras.includes(s.era)) return false;
      if (filters.moods.length && (!s.mood || !filters.moods.includes(s.mood)))
        return false;
      if (
        filters.origins.length &&
        (!s.origin || !filters.origins.includes(s.origin))
      )
        return false;
      if (filters.favoriteOnly && !sharedOn && !s.favorite) return false;
      return true;
    });
  }, [songs, sharedOn, sharedSongs, filters]);

  // Skladbe drugih, ki jih že imam (isti naslov+avtor ali že uvožene).
  const myLibraryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of allSongs) {
      keys.add(songMatchKey(s));
      if (s.imported_from) keys.add(s.imported_from);
    }
    return keys;
  }, [allSongs]);
  const inMyLibrary = (s: Song) => myLibraryKeys.has(s.id) || myLibraryKeys.has(songMatchKey(s));

  function closeShared() {
    setSharedOn(false);
    setImportMessage(null);
  }
  useBackableOpen(sharedOn, closeShared);

  async function handleImportShared(list: Song[]) {
    const todo = list.filter((s) => !inMyLibrary(s));
    if (!todo.length) return;
    setImportBusy(true);
    setImportMessage(null);
    try {
      const imported = await importSharedSongs(todo);
      setSongs((prev) => [...imported.filter((n) => !prev.some((s) => s.id === n.id)), ...prev]);
      setImportMessage({
        text:
          imported.length === 1
            ? `"${imported[0].title}" je v tvoji knjižnici.`
            : `${imported.length} skladb je v tvoji knjižnici.`,
        error: false,
      });
    } catch (e) {
      setImportMessage({ text: `Uvoz ni uspel: ${(e as Error).message}`, error: true });
    }
    setImportBusy(false);
  }

  const displaySongs = useMemo(() => {
    const byTitle = (a: Song, b: Song) => a.title.localeCompare(b.title, "sl");
    // "1960s" ni v ERAS, a obstaja v bazi (glej past "Pred 1960"/"1960s"
    // v CLAUDE.md) — uvrsti ga takoj za "Pred 1960"; neznane na konec.
    const eraIndex = (s: Song) => {
      const i = ERAS.indexOf(s.era);
      if (i >= 0) return i;
      return (s.era as string) === "1960s" ? 0.5 : ERAS.length;
    };
    return filteredSongs
      .filter((s) => !reportedSongIds.has(s.id))
      .sort((a, b) => {
        switch (songSort) {
          case "newest":
            return b.created_at.localeCompare(a.created_at);
          case "oldest":
            return a.created_at.localeCompare(b.created_at);
          case "za":
            return byTitle(b, a);
          case "author":
            return a.author.localeCompare(b.author, "sl") || byTitle(a, b);
          case "popular":
            return b.copy_count - a.copy_count || byTitle(a, b);
          case "era-old":
            return eraIndex(a) - eraIndex(b) || byTitle(a, b);
          case "era-new":
            return eraIndex(b) - eraIndex(a) || byTitle(a, b);
          default:
            return byTitle(a, b);
        }
      });
  }, [filteredSongs, songSort, reportedSongIds]);

  // Razpoloženja niso fiksen nabor: obrazcu ponudimo privzete predloge +
  // vsa že uporabljena (uporabniško dodana), filtru pa samo tista, ki jih
  // trenutno resnično ima kaka skladba (da ni praznih/neuporabnih čipov).
  const knownMoods = useMemo(() => {
    const extras = new Set<string>();
    for (const s of songs)
      if (s.mood && !(DEFAULT_MOODS as readonly string[]).includes(s.mood))
        extras.add(s.mood);
    return [
      ...DEFAULT_MOODS,
      ...Array.from(extras).sort((a, b) => a.localeCompare(b, "sl")),
    ];
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
      if (
        s.origin &&
        !(DEFAULT_ORIGINS as readonly string[]).includes(s.origin)
      )
        extras.add(s.origin);
    return [
      ...DEFAULT_ORIGINS,
      ...Array.from(extras).sort((a, b) => a.localeCompare(b, "sl")),
    ];
  }, [songs]);

  const usedOrigins = useMemo(() => {
    const set = new Set<string>();
    for (const s of songs) if (s.origin) set.add(s.origin);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sl"));
  }, [songs]);

  // Za "Delno naključen" ponudimo v spustnih seznamih samo vrednosti, ki
  // jih dejansko ima vsaj ena skladba (da izbira ne vodi v prazen rezultat).
  const usedGenres = useMemo(
    () => GENRES.filter((g) => songs.some((s) => s.genre === g)),
    [songs],
  );
  const usedEras = useMemo(
    () => ERAS.filter((e) => songs.some((s) => s.era === e)),
    [songs],
  );
  const usedAuthors = useMemo(
    () =>
      Array.from(new Set(songs.map((s) => s.author))).sort((a, b) =>
        a.localeCompare(b, "sl"),
      ),
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
        .map((genre) => ({
          label: genre,
          count: songs.filter((s) => s.genre === genre).length,
        }))
        .sort((a, b) => b.count - a.count),
    [songs, usedGenres],
  );

  // "Predstavljeno": vsak dan naključno (a ves dan stabilno) izbere dva
  // avtorja z vsaj tremi skladbami in za vsakega tri njegove skladbe.
  const featuredArtists = useMemo(
    () => pickDailyFeatured(songs, 4, 3),
    [songs],
  );

  // "Avtorji": vsi avtorji (največ skladb najprej), z avtorjevo sliko, če je
  // nastavljena (glej author_images / SongForm "Slika avtorja").
  const authorHighlights = useMemo(
    () =>
      usedAuthors
        .map((author) => ({
          label: author,
          count: songs.filter((s) => s.author === author).length,
        }))
        .sort(
          (a, b) => b.count - a.count || a.label.localeCompare(b.label, "sl"),
        ),
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
    origin: "Izvor",
  };

  const newestFirst = useMemo(
    () =>
      [...songs].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [songs],
  );

  // Zavihek "Novo": nad neskončnim seznamom najprej 10 nedavno dodanih,
  // spodaj pa še skupine "Novo po ..." (avtor/obdobje/razpoloženje) — vsaka
  // skupina prikaže do 4 najnovejše skladbe, skupine same so razvrščene po
  // tem, katera ima najbolj nedavno dodano skladbo.
  const recentTop = useMemo(() => newestFirst.slice(0, 10), [newestFirst]);
  const newByAuthor = useMemo(
    () => groupByRecent(songs, (s) => s.author, 4, 4),
    [songs],
  );
  const newByEra = useMemo(
    () => groupByRecent(songs, (s) => s.era, 4, 4),
    [songs],
  );
  const newByMood = useMemo(
    () => groupByRecent(songs, (s) => s.mood, 4, 4),
    [songs],
  );

  const mostPopular = useMemo(
    () =>
      [...songs].sort((a, b) => {
        if (b.copy_count !== a.copy_count) return b.copy_count - a.copy_count;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }),
    [songs],
  );

  function handleSaved(saved: Song, mode: "insert" | "update") {
    if (mode === "insert") {
      setSongs((prev) => [saved, ...prev]);
      // Dodano iz čakalne vrste — vnos je obdelan, odstrani ga.
      if (queueAddingId) handleRemoveQueued(queueAddingId);
    } else {
      setSongs((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setRandomPick((p) => (p?.id === saved.id ? saved : p));
    }
    setShowForm(false);
    setEditing(null);
    setPrefillDraft(null);
    setQueueAddingId(null);
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

  async function refreshQueued() {
    const { data, error } = await supabase
      .from("queued_songs")
      .select("*")
      .order("added_at", { ascending: true });
    if (error) {
      setQueuedError(error.message);
      return;
    }
    setQueuedError(null);
    setQueuedSongs(data as QueuedSong[]);
  }

  async function handleRemoveQueued(id: string) {
    const prev = queuedSongs;
    setQueuedSongs((s) => s.filter((x) => x.id !== id));
    const { error } = await supabase.from("queued_songs").delete().eq("id", id);
    if (error) {
      setQueuedSongs(prev);
      setQueuedError(error.message);
    }
  }

  function openFavArchive() {
    setJamOpen(false);
    setGoalOpen(false);
    setFixOpen(false);
    setQueueOpen(false);
    setPlaylistsOpen(false);
    setReviewOpen(false);
    setFavArchiveOpen(true);
    window.scrollTo({ top: 0 });
  }

  function openPlaylists() {
    setJamOpen(false);
    setGoalOpen(false);
    setFixOpen(false);
    setQueueOpen(false);
    setFavArchiveOpen(false);
    setReviewOpen(false);
    setPlaylistsOpen(true);
    window.scrollTo({ top: 0 });
  }

  function openQueue() {
    setJamOpen(false);
    setGoalOpen(false);
    setFixOpen(false);
    setFavArchiveOpen(false);
    setReviewOpen(false);
    setPlaylistsOpen(false);
    setQueueOpen(true);
    refreshImportBatches();
    window.scrollTo({ top: 0 });
  }

  async function refreshImportBatches() {
    const { data, error } = await supabase
      .from("import_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setImportBatchesError(error.message);
      return;
    }
    setImportBatchesError(null);
    setImportBatches(data as ImportBatch[]);
  }

  // "Dodaj v knjižnico" na strani Čakalna vrsta: celoten SongForm z
  // naslovom/avtorjem vnaprej izpolnjenim, izrisan pod vnosom.
  function handleAddQueuedToLibrary(q: QueuedSong) {
    setEditing(null);
    setShowForm(true);
    setPrefillDraft({ title: q.title, author: q.author });
    setQueueAddingId(q.id);
  }

  function handleReported(report: SongReport) {
    setReports((prev) => [...prev, report]);
  }

  async function refreshReports() {
    const { data, error } = await supabase
      .from("song_reports")
      .select("*")
      .order("reported_at", { ascending: true });
    if (error) {
      setReportsError(error.message);
      return;
    }
    setReportsError(null);
    setReports(data as SongReport[]);
  }

  async function handleSaveReportNote(report: SongReport) {
    const note = noteDraft.trim() || null;
    setNoteSaving(true);
    const { data, error } = await supabase
      .from("song_reports")
      .update({ note })
      .eq("id", report.id)
      .select("id");
    setNoteSaving(false);
    // Brez update politike (migracija 0019) RLS tiho ne posodobi ničesar.
    if (error || !data?.length) {
      setReportsError(error?.message ?? "Opisa ni bilo mogoče shraniti (manjka migracija 0019?).");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, note } : r)));
    setNoteEditId(null);
  }

  async function handleResolveReports(toResolve: SongReport[]) {
    const ids = toResolve.map((r) => r.id);
    const prev = reports;
    setReports((r) => r.filter((x) => !ids.includes(x.id)));
    const { error } = await supabase
      .from("song_reports")
      .delete()
      .in("id", ids);
    if (error) {
      setReports(prev);
      setReportsError(error.message);
    }
  }

  function openReview() {
    setJamOpen(false);
    setGoalOpen(false);
    setQueueOpen(false);
    setFixOpen(false);
    setFavArchiveOpen(false);
    setPlaylistsOpen(false);
    setReviewError(null);
    setReviewOpen(true);
    window.scrollTo({ top: 0 });
  }

  // "Odobri": skladba gre iz pregleda v knjižnico (review_pending = false),
  // optimistično z vrnitvijo ob napaki.
  // Meni kartice → "Pregled in odobritev": skladbo vrne v pregled (skrije se iz
  // knjižnice, pokaže na strani Pregled in odobritev). Optimistično z vrnitvijo.
  async function handleSendToReview(song: Song) {
    if (!window.confirm(`Pošljem "${song.title}" v Pregled in odobritev? Do odobritve bo skrita iz knjižnice.`)) return;
    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, review_pending: true } : s)));
    const { error } = await supabase.from("songs").update({ review_pending: true }).eq("id", song.id);
    if (error) {
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, review_pending: false } : s)));
      window.alert(`Pošiljanje v pregled ni uspelo: ${error.message}`);
    }
  }

  // "Pojdi na dno" (desno od razvrščanja nad seznamom): odpre seznam, naloži
  // vse strani (sicer je "dno" le konec prvih 40) in gladko odpelje na konec.
  function scrollToListBottom() {
    if (!sharedOn && !hasActiveFilters(filters) && !authorFilter && !songsVisible) setStoredSongsVisible("1");
    setResultsPage({ key: filtersKey, count: Infinity });
    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }, 80);
  }

  async function handleApprove(list: Song[]) {
    if (!list.length) return;
    const ids = list.map((s) => s.id);
    setReviewError(null);
    setApprovingIds((prev) => new Set([...prev, ...ids]));
    const { error } = await supabase.from("songs").update({ review_pending: false }).in("id", ids);
    setApprovingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (error) {
      setReviewError(`Odobritev ni uspela: ${error.message}`);
      return;
    }
    setSongs((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, review_pending: false } : s)));
  }

  // "Akordi preverjeni" / razveljavitev "Predvajalnik preverjen" na strani
  // Pregled in odobritev (potrditev predvajalnika je v Sam Špili ⚙, ker
  // zamrzne čase posnetka, ki igra). Optimistično z vrnitvijo ob napaki.
  async function handleVerify(song: Song, field: "verified_chords_at" | "verified_player_at", value: string | null) {
    const prev = song[field] ?? null;
    const apply = (v: string | null) => setSongs((list) => list.map((x) => (x.id === song.id ? { ...x, [field]: v } : x)));
    setReviewError(null);
    apply(value);
    const { error } = await supabase.from("songs").update({ [field]: value }).eq("id", song.id);
    if (error) {
      apply(prev);
      setReviewError(
        `Shranjevanje ni uspelo: ${error.message}${/verified_/.test(error.message) ? " — poženi migracijo 0035_add_verification.sql v Supabase." : ""}`,
      );
    }
  }
  // Skladba je pripravljena za odobritev šele z obema oznakama.
  const reviewReady = (s: Song) => !!s.verified_chords_at && !!s.verified_player_at;

  function openFix(songId?: string) {
    setJamOpen(false);
    setGoalOpen(false);
    setQueueOpen(false);
    setFavArchiveOpen(false);
    setReviewOpen(false);
    setPlaylistsOpen(false);
    setFixOpen(true);
    const song = songId ? songs.find((s) => s.id === songId) : undefined;
    if (song) handleEdit(song);
    else window.scrollTo({ top: 0 });
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

  // Klik na naslov "Bitne Tabs": "trdo" osveži aplikacijo (kot Ctrl+F5) in
  // se vrne na domačo stran — zapre Jam/Mojih 20/Filtre (sicer bi jih
  // usePersistentBool po osvežitvi spet odprl), izprazni predpomnilnik
  // service workerja (sw.js je stale-while-revalidate, zato bi navadna
  // osvežitev najprej pokazala staro verzijo) in stran ponovno naloži.
  async function handleHardRefresh() {
    try {
      for (const key of [
        "komadi:jam:open",
        "komadi:goal:open",
        "komadi:filters:open",
      ]) {
        window.localStorage.setItem(key, "0");
      }
    } catch {}
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.scrollTo(0, 0);
    window.location.reload();
  }

  function handleBackFromFilter() {
    setAuthorFilter(null);
    setFilters(emptyFilters);
    setFiltersOpen(false);
    // Cel seznam, da je prejšnji položaj (lahko globoko v seznamu) spet dosegljiv.
    setResultsPage({ key: JSON.stringify(emptyFilters), count: Infinity });
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
    setQueueAddingId(null);
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
    const error = await addToQueue(title, author);
    setQuickAddBusy(false);
    if (error) {
      setQuickAddError(error);
      return;
    }
    closeQuickAdd();
  }

  // Zapis v čakalno vrsto (queued_songs) — skupno za "Hitro" in "Glasovno".
  // Vrne sporočilo napake ali null.
  async function addToQueue(title: string, author: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("queued_songs")
      .insert({ title, author })
      .select()
      .single();
    if (error) return error.message;
    if (data) setQueuedSongs((prev) => [...prev, data as QueuedSong]);
    return null;
  }

  // "Priljubljena" v meniju kartice (SongCard.tsx) — preklopi song.favorite
  // takoj lokalno, nato v bazi; ob napaki vrne prejšnjo vrednost.
  async function handleToggleFavorite(song: Song) {
    // favorited_at določa mesec v "Priljubljeno ta mesec" / arhivu.
    const next = { favorite: !song.favorite, favorited_at: song.favorite ? null : new Date().toISOString() };
    const prev = { favorite: song.favorite, favorited_at: song.favorited_at };
    const apply = (value: typeof next) => {
      setSongs((list) => list.map((x) => (x.id === song.id ? { ...x, ...value } : x)));
      setRandomPick((p) => (p?.id === song.id ? { ...p, ...value } : p));
      setRandomFive((list) => list?.map((x) => (x.id === song.id ? { ...x, ...value } : x)) ?? null);
    };
    apply(next);
    const { error } = await supabase.from("songs").update(next).eq("id", song.id);
    if (error) {
      apply(prev);
      alert("Napaka pri shranjevanju priljubljene: " + error.message);
    }
  }

  async function handleAddToJam(song: Song) {
    const jamAddedAt = new Date().toISOString();
    setSongs((s) =>
      s.map((x) =>
        x.id === song.id
          ? { ...x, jam_added_at: jamAddedAt, jam_played: false }
          : x,
      ),
    );
    await supabase
      .from("songs")
      .update({ jam_added_at: jamAddedAt, jam_played: false })
      .eq("id", song.id);
    recordJamHistory({ song_id: song.id, title: song.title, author: song.author, added_at: jamAddedAt });
  }

  // Vsako dodajanje v Jam se zapiše tudi v arhiv (jam_history), ki ostane po
  // odstranitvi iz Jama. Neuspeh zapisa ne ustavi dodajanja v Jam.
  async function recordJamHistory(entry: Omit<JamHistoryEntry, "id">) {
    const { data } = await supabase.from("jam_history").insert(entry).select().single();
    if (data) setJamHistory((h) => [...h, data as JamHistoryEntry]);
  }

  async function openJamArchive() {
    setJamArchiveOpen(true);
    setJamShared(false);
    const { data, error } = await supabase
      .from("jam_history")
      .select("*")
      .order("added_at", { ascending: true });
    if (error) {
      setJamHistoryError(error.message);
      return;
    }
    setJamHistoryError(null);
    setJamHistory(data as JamHistoryEntry[]);
  }

  async function handleToggleJamPlayed(song: Song) {
    const nextPlayed = !song.jam_played;
    setSongs((s) =>
      s.map((x) => (x.id === song.id ? { ...x, jam_played: nextPlayed } : x)),
    );
    await supabase
      .from("songs")
      .update({ jam_played: nextPlayed })
      .eq("id", song.id);
  }

  async function handleRemoveFromJam(song: Song) {
    setSongs((s) =>
      s.map((x) =>
        x.id === song.id ? { ...x, jam_added_at: null, jam_played: false } : x,
      ),
    );
    await supabase
      .from("songs")
      .update({ jam_added_at: null, jam_played: false })
      .eq("id", song.id);
  }

  // "Skladbe ni" — hiter vnos naslova/avtorja, ki gre samo v Jam (ločena
  // tabela jam_extras), ne v glavno knjižnico songs.
  async function addJamExtra(title: string, author: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("jam_extras")
      .insert({ title, author })
      .select()
      .single();
    if (error || !data) return error?.message ?? "Napaka pri dodajanju.";
    setJamExtras((s) => [...s, data as JamExtra]);
    recordJamHistory({ song_id: null, title, author, added_at: (data as JamExtra).added_at });
    return null;
  }

  async function handleToggleJamExtraPlayed(extra: JamExtra) {
    const nextPlayed = !extra.played;
    setJamExtras((s) =>
      s.map((x) => (x.id === extra.id ? { ...x, played: nextPlayed } : x)),
    );
    await supabase
      .from("jam_extras")
      .update({ played: nextPlayed })
      .eq("id", extra.id);
  }

  async function handleRemoveJamExtra(extra: JamExtra) {
    setJamExtras((s) => s.filter((x) => x.id !== extra.id));
    await supabase.from("jam_extras").delete().eq("id", extra.id);
  }

  // --- Skupni Jam --------------------------------------------------------
  // Skladbe drugih uporabnikov v Skupnem Jamu (za akorde): naloži manjkajoče.
  useEffect(() => {
    const missing = [
      ...new Set(
        sharedJamItems
          .map((x) => x.song_id)
          .filter((id): id is string => !!id && !allSongs.some((s) => s.id === id) && !(id in sharedJamSongs)),
      ),
    ];
    if (!missing.length) return;
    let cancelled = false;
    supabase
      .from("songs")
      .select("*")
      .in("id", missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSharedJamSongs((prev) => ({ ...prev, ...Object.fromEntries((data as Song[]).map((s) => [s.id, s])) }));
      });
    return () => {
      cancelled = true;
    };
  }, [sharedJamItems, allSongs, sharedJamSongs]);
  const sharedJamSong = (id: string | null) =>
    id ? (allSongs.find((s) => s.id === id) ?? sharedJamSongs[id] ?? null) : null;
  // Ime za krogec z začetnicami pri drugih uporabnikih.
  const myDisplayName = fullNameFor(user) || user.email || null;
  const sharedBoardItems: JamBoardItem[] = sharedJamItems.map((item) => ({
    key: item.id,
    title: item.title,
    author: item.author,
    played: item.played,
    song: sharedJamSong(item.song_id),
    addedByName: item.added_by_name,
  }));
  const sharedJamSongIds = new Set(sharedJamItems.flatMap((x) => (x.song_id ? [x.song_id] : [])));
  // Kdo ima trenutno odprt Skupni Jam (Supabase Realtime Presence, nič v bazi):
  // krogci z začetnicami pod gumbom "Skupni Jam". Naročen, ko je Jam odprt —
  // vidiš prisotne tudi iz osebnega Jama; javiš se (track) samo, dokler imaš
  // odprt Skupni Jam.
  const [jamPresence, setJamPresence] = useState<{ id: string; name: string }[]>([]);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const presenceTrackRef = useRef(false);
  const presenceNameRef = useRef(myDisplayName ?? "");
  useEffect(() => {
    presenceTrackRef.current = jamOpen && jamShared && !jamArchiveOpen;
    presenceNameRef.current = myDisplayName ?? "";
  });
  useEffect(() => {
    if (!jamOpen) return;
    const channel = supabase.channel("shared-jam-presence", { config: { presence: { key: user.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        setJamPresence(Object.entries(state).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "" })));
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        presenceChannelRef.current = channel;
        if (presenceTrackRef.current) channel.track({ name: presenceNameRef.current });
      });
    return () => {
      presenceChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [jamOpen, user.id]);
  const presenceTracking = jamOpen && jamShared && !jamArchiveOpen;
  useEffect(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    if (presenceTracking) channel.track({ name: myDisplayName ?? "" });
    else channel.untrack();
  }, [presenceTracking, myDisplayName]);
  const presenceDots =
    jamOpen && jamPresence.length > 0 ? (
      <div className="flex -space-x-1.5" aria-label={`V Skupnem Jamu: ${jamPresence.map((p) => p.name).join(", ")}`}>
        {jamPresence.slice(0, 6).map((p) => (
          <span
            key={p.id}
            title={p.id === user.id ? `${p.name} (ti)` : p.name}
            style={{ backgroundColor: authorAccentHex(p.name || "?") }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-neutral-50 dark:ring-neutral-900"
          >
            {initialsOf(p.name)}
          </span>
        ))}
        {jamPresence.length > 6 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-500 text-[9px] font-semibold text-white ring-2 ring-neutral-50 dark:ring-neutral-900">
            +{jamPresence.length - 6}
          </span>
        )}
      </div>
    ) : null;

  // --- Skupni pogled akordov (Skupni Jam) --------------------------------
  // Kdor prvi v Skupnem Jamu odpre akorde, vodi; ostali (ki sledijo) vidijo
  // isto skladbo na isti višini, njegov Smart play in celozaslonski način.
  // Supabase Realtime Broadcast, nič v bazi (src/lib/sharedChordsView.ts).
  // mode = način pregledovalnika pri vodji ("samspili" = Sam Špili, null = navaden).
  type SharedLeader = { id: string; name: string; songId: string; since: number; view: LocalView | null; seen: number; mode?: "samspili" | null };
  const [sharedLeader, setSharedLeader] = useState<SharedLeader | null>(null);
  const [followingLeader, setFollowingLeader] = useState(true);
  const viewChannelRef = useRef<RealtimeChannel | null>(null);
  const sharedLeaderRef = useRef<SharedLeader | null>(null);
  const followingRef = useRef(true);
  // Odprtje/zaprtje, ki ga je sprožilo sledenje (ne moj klik).
  const expectedOpenRef = useRef<string | null | undefined>(undefined);
  const lastSentRef = useRef(0);
  const lastViewRef = useRef<LocalView | null>(null);
  const amLeader = sharedLeader?.id === user.id;
  const openChordsModeRef = useRef(openChordsMode);
  useEffect(() => {
    sharedLeaderRef.current = sharedLeader;
    followingRef.current = followingLeader;
    openChordsModeRef.current = openChordsMode;
  });
  // Odpri akorde kot vodja (isti način — Sam Špili ali navaden), če še niso tako odprti.
  const openLikeLeader = (songId: string, mode: "samspili" | null | undefined) => {
    let open: string | null = null;
    let openMode: string | null = null;
    try {
      open = window.localStorage.getItem("komadi:chords:open");
      openMode = window.localStorage.getItem("komadi:chords:mode");
    } catch {}
    if (open === songId && (openMode ?? null) === (mode ?? null)) return;
    // Samo menjava načina iste skladbe ne sproži dogodka "odprtje" (onStore), zato brez pričakovanja.
    if (open !== songId) expectedOpenRef.current = songId;
    openChordsViewer(songId, mode ?? undefined);
  };
  const sendView = (msg: SharedViewMessage) =>
    viewChannelRef.current?.send({ type: "broadcast", event: "view", payload: msg });
  const sendLeaderView = (view: LocalView | null) => {
    const me = sharedLeaderRef.current;
    if (!me || me.id !== user.id || !view) return;
    // Sam Špili: napredek v vrstici posodobljen na trenutek pošiljanja (zamik
    // omejevanja pošiljanja in srčni utrip bi ga sicer poslali zastarelega).
    let ss = view.ss;
    if (ss?.playing && ss.rate > 0) {
      const late = (Date.now() - lastViewAtRef.current) / 1000;
      ss = { ...ss, p: Math.min(1, ss.p + ss.rate * late) };
    }
    sendView({ type: "view", leaderId: user.id, leaderName: myDisplayName ?? "", songId: me.songId, since: me.since, mode: openChordsModeRef.current === "samspili" ? "samspili" : null, ...view, ...(ss ? { ss } : {}) });
  };
  // Pogled vodje (ChordsViewer onLocalView): pošlji največ ~10× na sekundo, zadnjega vedno.
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastViewAtRef = useRef(0);
  const onLeaderView = (view: LocalView) => {
    lastViewRef.current = view;
    lastViewAtRef.current = Date.now();
    const wait = 90 - (Date.now() - lastSentRef.current);
    clearTimeout(sendTimerRef.current);
    const flush = () => {
      lastSentRef.current = Date.now();
      sendLeaderView(lastViewRef.current);
    };
    if (wait <= 0) flush();
    else sendTimerRef.current = setTimeout(flush, wait);
  };
  useEffect(() => {
    if (!presenceTracking) return;
    const channel = supabase.channel("shared-jam-view", { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "view" }, ({ payload }) => {
        const msg = payload as SharedViewMessage;
        const current = sharedLeaderRef.current;
        if (msg.type === "close") {
          if (current?.id !== msg.leaderId) return;
          publishRemoteView(null);
          setSharedLeader(null);
          if (followingRef.current) {
            expectedOpenRef.current = null;
            closeChordsViewer();
          }
          return;
        }
        // "Vodi prvi": ob sočasnem odprtju ostane tisti, ki je začel prej.
        const stale = !current || Date.now() - current.seen > SHARED_VIEW_STALE_MS;
        const earlier = current && (msg.since < current.since || (msg.since === current.since && msg.leaderId < current.id));
        if (!(stale || current.id === msg.leaderId || earlier)) return;
        // Pogled gre mimo React stanja (publishRemoteView); stanje vodje se
        // spremeni samo, ko je drug vodja, skladba ali način — sicer bi vsako
        // sporočilo na novo izrisalo celo stran in zatikalo drsenje sledilca.
        publishRemoteView(msg.songId, msg);
        const mode = msg.mode ?? null;
        if (current && !stale && current.id === msg.leaderId && current.name === msg.leaderName && current.songId === msg.songId && current.since === msg.since && (current.mode ?? null) === mode) {
          current.seen = Date.now();
          current.view = msg;
        } else {
          setSharedLeader({ id: msg.leaderId, name: msg.leaderName, songId: msg.songId, since: msg.since, view: msg, seen: Date.now(), mode });
        }
        if (followingRef.current) openLikeLeader(msg.songId, msg.mode);
      })
      .subscribe((status) => {
        // Ob (ponovnem) vstopu v Skupni Jam: privzeto sledim, brez starega vodje.
        if (status !== "SUBSCRIBED") return;
        setFollowingLeader(true);
        publishRemoteView(null);
        setSharedLeader(null);
      });
    viewChannelRef.current = channel;
    // Srčni utrip vodje in odstranitev vodje brez utripa.
    const beat = setInterval(() => {
      const me = sharedLeaderRef.current;
      if (me?.id === user.id) sendLeaderView(lastViewRef.current);
      else if (me && Date.now() - me.seen > SHARED_VIEW_STALE_MS) {
        publishRemoteView(null);
        setSharedLeader(null);
      }
    }, SHARED_VIEW_HEARTBEAT_MS);
    return () => {
      clearInterval(beat);
      clearTimeout(sendTimerRef.current);
      if (sharedLeaderRef.current?.id === user.id) sendView({ type: "close", leaderId: user.id });
      viewChannelRef.current = null;
      supabase.removeChannel(channel);
      sharedLeaderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceTracking, user.id]);
  // Moje odprtje/zaprtje akordov (klik), ne tisto iz sledenja: odprtje brez
  // aktivnega vodje → vodim; če vodja že je → sledenje se ustavi (moja izbira).
  useEffect(() => {
    if (!presenceTracking) return;
    let prev: string | null = null;
    try {
      prev = window.localStorage.getItem("komadi:chords:open");
    } catch {}
    const onStore = () => {
      let open: string | null = null;
      try {
        open = window.localStorage.getItem("komadi:chords:open");
      } catch {}
      if (open === prev) return;
      prev = open;
      if (expectedOpenRef.current !== undefined && expectedOpenRef.current === open) {
        expectedOpenRef.current = undefined;
        return;
      }
      expectedOpenRef.current = undefined;
      const leader = sharedLeaderRef.current;
      const leaderActive = !!leader && (leader.id === user.id || Date.now() - leader.seen <= SHARED_VIEW_STALE_MS);
      if (open) {
        if (!leaderActive || leader?.id === user.id) {
          const since = leader?.id === user.id ? leader.since : Date.now();
          const next = { id: user.id, name: myDisplayName ?? "", songId: open, since, view: null, seen: Date.now() };
          sharedLeaderRef.current = next;
          setSharedLeader(next);
          lastViewRef.current = null;
        } else {
          setFollowingLeader(false);
        }
      } else if (leader?.id === user.id) {
        sendView({ type: "close", leaderId: user.id });
        sharedLeaderRef.current = null;
        setSharedLeader(null);
      } else if (leaderActive) {
        setFollowingLeader(false);
      }
    };
    window.addEventListener("komadi-storage", onStore);
    return () => window.removeEventListener("komadi-storage", onStore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceTracking, user.id]);
  // Skladba vodje iz tuje knjižnice: naloži jo, da se akordi lahko odprejo.
  const leaderSongId = sharedLeader && !amLeader ? sharedLeader.songId : null;
  useEffect(() => {
    if (!leaderSongId || allSongs.some((x) => x.id === leaderSongId) || leaderSongId in sharedJamSongs) return;
    let cancelled = false;
    supabase
      .from("songs")
      .select("*")
      .eq("id", leaderSongId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSharedJamSongs((prev) => ({ ...prev, [data.id]: data as Song }));
      });
    return () => {
      cancelled = true;
    };
  }, [leaderSongId, allSongs, sharedJamSongs]);
  // Spet sledi vodji (gumb "Sledi" v pregledovalniku ali na strani Skupnega Jama).
  const followLeader = () => {
    if (!sharedLeader) return;
    setFollowingLeader(true);
    openLikeLeader(sharedLeader.songId, sharedLeader.mode);
  };
  const leaderSong = sharedLeader
    ? (allSongs.find((x) => x.id === sharedLeader.songId) ?? sharedJamSongs[sharedLeader.songId] ?? null)
    : null;
  const viewerShared: SharedViewProp | undefined = !presenceTracking
    ? undefined
    : amLeader
      ? { role: "leader", onLocalView: onLeaderView }
      : sharedLeader && followingLeader
        ? {
            role: "follower",
            leaderName: sharedLeader.name,
            onStopFollowing: () => setFollowingLeader(false),
          }
        : sharedLeader
          ? {
              role: "paused",
              leaderName: sharedLeader.name,
              onFollow: followLeader,
            }
          : undefined;
  // Naloži ob odprtju Jama (tudi po osvežitvi); naprej skrbi realtime.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("shared_jam_items")
        .select("*")
        .order("added_at", { ascending: true });
      if (cancelled) return;
      setSharedJamError(error ? error.message : null);
      if (data) setSharedJamItems(data as SharedJamItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [jamOpen]);

  async function addToSharedJam(song: Song | null, title: string, author: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("shared_jam_items")
      .insert({ song_id: song?.id ?? null, title, author, added_by_name: myDisplayName })
      .select()
      .single();
    if (error || !data) return error?.message ?? "Napaka pri dodajanju.";
    setSharedJamItems((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as SharedJamItem]));
    return null;
  }
  // "Dodaj v Skupni Jam" iz menija kartice (SongCard, FavoriteCard); skladbe,
  // ki je že v Skupnem Jamu, ne doda znova.
  function handleAddToSharedJam(song: Song) {
    if (sharedJamItems.some((x) => x.song_id === song.id)) return;
    addToSharedJam(song, song.title, song.author);
  }
  async function handleToggleSharedJamPlayed(id: string) {
    const item = sharedJamItems.find((x) => x.id === id);
    if (!item) return;
    const played = !item.played;
    setSharedJamItems((prev) => prev.map((x) => (x.id === id ? { ...x, played } : x)));
    const { error } = await supabase.from("shared_jam_items").update({ played }).eq("id", id);
    if (error) setSharedJamItems((prev) => prev.map((x) => (x.id === id ? { ...x, played: item.played } : x)));
  }
  async function handleRemoveSharedJam(id: string) {
    const prev = sharedJamItems;
    setSharedJamItems((items) => items.filter((x) => x.id !== id));
    const { error } = await supabase.from("shared_jam_items").delete().eq("id", id);
    if (error) setSharedJamItems(prev);
  }

  async function handleAddToGoal(song: Song) {
    const goalAddedAt = new Date().toISOString();
    setSongs((s) =>
      s.map((x) =>
        x.id === song.id
          ? { ...x, goal_added_at: goalAddedAt, goal_learned: false }
          : x,
      ),
    );
    setGoalPickerOpen(false);
    setGoalPickerQuery("");
    await supabase
      .from("songs")
      .update({ goal_added_at: goalAddedAt, goal_learned: false })
      .eq("id", song.id);
  }

  async function handleToggleGoalLearned(song: Song) {
    const nextLearned = !song.goal_learned;
    setSongs((s) =>
      s.map((x) =>
        x.id === song.id ? { ...x, goal_learned: nextLearned } : x,
      ),
    );
    await supabase
      .from("songs")
      .update({ goal_learned: nextLearned })
      .eq("id", song.id);
  }

  async function handleRemoveFromGoal(song: Song) {
    setSongs((s) =>
      s.map((x) =>
        x.id === song.id
          ? { ...x, goal_added_at: null, goal_learned: false }
          : x,
      ),
    );
    await supabase
      .from("songs")
      .update({ goal_added_at: null, goal_learned: false })
      .eq("id", song.id);
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
    setGoalExtras((s) =>
      s.map((x) => (x.id === extra.id ? { ...x, learned: nextLearned } : x)),
    );
    await supabase
      .from("goal_extras")
      .update({ learned: nextLearned })
      .eq("id", extra.id);
  }

  async function handleRemoveGoalExtra(extra: GoalExtra) {
    setGoalExtras((s) => s.filter((x) => x.id !== extra.id));
    await supabase.from("goal_extras").delete().eq("id", extra.id);
  }

  // Sistemski gumb "Nazaj" (Android) naj se za te poglede obnaša enako kot
  // klik na njihov obstoječi gumb za zapiranje/nazaj (glej
  // src/lib/useBackableOpen.ts).
  useBackableOpen(
    hasActiveFilters(filters) || Boolean(authorFilter),
    handleBackFromFilter,
  );
  useBackableOpen(activeView !== "list", () => setActiveView("list"));
  useBackableOpen(showForm || editing !== null, closeForm);
  useBackableOpen(addChoiceOpen, () => setAddChoiceOpen(false));
  useBackableOpen(quickAddOpen, closeQuickAdd);
  useBackableOpen(voiceAddOpen, () => setVoiceAddOpen(false));
  useBackableOpen(jamOpen, () => setJamOpen(false));
  useBackableOpen(jamOpen && jamArchiveOpen, () => setJamArchiveOpen(false));
  // Skupni Jam: Nazaj vrne na osebni Jam.
  useBackableOpen(jamOpen && jamShared && !jamArchiveOpen, () => setJamShared(false));
  function toggleJamShared() {
    setJamArchiveOpen(false);
    setJamShared(!jamShared || jamArchiveOpen);
  }
  useBackableOpen(goalOpen, () => setGoalOpen(false));
  useBackableOpen(fixOpen, () => setFixOpen(false));
  useBackableOpen(queueOpen, () => setQueueOpen(false));
  useBackableOpen(reviewOpen, () => setReviewOpen(false));
  useBackableOpen(favArchiveOpen, () => setFavArchiveOpen(false));
  useBackableOpen(playlistsOpen, () => setPlaylistsOpen(false));
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
    const prev = allSongs;
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
    setSongs((s) =>
      s.map((x) => (x.id === song.id ? { ...x, copy_count: nextCount } : x)),
    );
    await supabase
      .from("songs")
      .update({ copy_count: nextCount })
      .eq("id", song.id);
  }

  function pickRandom() {
    const pool = !sharedOn && filteredSongs.length ? filteredSongs : songs;
    setRandomPickFromPartial(false);
    setRandomFive(null);
    if (!pool.length) {
      setRandomPick(null);
      return;
    }
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setRandomPick(choice);
  }

  // "Izberi drugo" na naključno izbrani kartici: za navadno "Naključno" izbere
  // novo naključno skladbo, za "Delno naključno" pa nazaj odpre izbirni
  // obrazec (isto kot začetni klik na "Delno naključno"), ker mora uporabnik
  // spet ročno izbrati vrednost merila.
  function handlePickAnother() {
    if (randomPickFromPartial) {
      setRandomPick(null);
      setRandomFive(null);
      handlePartialStart();
      return;
    }
    pickRandom();
  }

  // Gumb "5 ↻" ob trenutno naključno izbrani kartici: prikaže (in ob
  // ponovnem kliku znova premeša) seznam 5 naključnih skladb iz istega
  // nabora kot navadno "Naključno" (upošteva aktivne filtre, če obstajajo).
  function pickRandomFive() {
    const pool = !sharedOn && filteredSongs.length ? filteredSongs : songs;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setRandomFive(shuffled.slice(0, 5));
  }

  function handlePartialStart() {
    const dims: PartialDimension[] = [
      "genre",
      "author",
      "era",
      "mood",
      "origin",
    ];
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
        case "origin":
          return s.origin === value;
        case "author": {
          // Mehko ujemanje: vsaka beseda iz vnosa se mora pojaviti nekje v
          // imenu avtorja (ni treba vnesti celega imena/vseh besed v enakem
          // vrstnem redu) — namesto strogega ujemanja celotnega niza.
          const authorLower = s.author.toLowerCase();
          const queryWords = value.toLowerCase().split(/\s+/).filter(Boolean);
          return queryWords.every((w) => authorLower.includes(w));
        }
      }
    });

    if (!pool.length) {
      setPartialError(
        `Nobena skladba ne ustreza: ${PARTIAL_LABELS[partialDimension]} = "${value}".`,
      );
      return;
    }

    const choice = pool[Math.floor(Math.random() * pool.length)];
    setRandomPick(choice);
    setRandomPickFromPartial(true);
    setPartialOpen(false);
  }

  // Klik kamorkoli izven gumbov Novo/Popularno ali njunega prikaznega
  // območja zapre pogled nazaj na navaden seznam.
  useEffect(() => {
    if (activeView === "list") return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-view-toggle]") ||
        target.closest("[data-view-section]") ||
        target.closest("[data-view-portal]")
      ) {
        return;
      }
      setActiveView("list");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeView]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6 lg:max-w-6xl">
      <header className="relative flex items-center justify-between">
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
                {jamShared && !jamArchiveOpen ? "Skupni Jam" : "Bitne Jam!"}
              </span>
            </h1>
            <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={toggleJamShared}
              aria-pressed={jamShared && !jamArchiveOpen}
              title={jamShared ? "Nazaj na moj Jam" : "Skupni Jam — vidijo in dodajajo vsi uporabniki"}
              className={`inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 px-4 py-1.5 text-sm font-medium transition ${
                jamShared && !jamArchiveOpen
                  ? "bg-fuchsia-600 text-white"
                  : "text-neutral-600 hover:bg-fuchsia-500/10 hover:text-fuchsia-600 dark:text-neutral-300 dark:hover:text-fuchsia-400"
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
                className="h-4 w-4 shrink-0"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Skupni Jam
            </button>
            <button
              type="button"
              onClick={() => (jamArchiveOpen ? setJamArchiveOpen(false) : openJamArchive())}
              aria-pressed={jamArchiveOpen}
              title={jamArchiveOpen ? "Nazaj na trenutni Jam" : "Arhiv preteklih Jamov"}
              className={`inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 px-4 py-1.5 text-sm font-medium transition ${
                jamArchiveOpen
                  ? "bg-fuchsia-600 text-white"
                  : "text-neutral-600 hover:bg-fuchsia-500/10 hover:text-fuchsia-600 dark:text-neutral-300 dark:hover:text-fuchsia-400"
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
                className="h-4 w-4 shrink-0"
              >
                <rect width="20" height="5" x="2" y="3" rx="1" />
                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                <path d="M10 12h4" />
              </svg>
              Arhiv
            </button>
            {/* Kdo ima trenutno odprt Skupni Jam (Presence). */}
            {presenceDots && (
              <div className="ml-1 flex items-center gap-2 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                Trenutno v Jamu:
                {presenceDots}
              </div>
            )}
            </div>
            <button
              type="button"
              onClick={() => {
                setJamOpen(false);
                setJamArchiveOpen(false);
              }}
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
        ) : playlistsOpen ? (
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
                className="h-6 w-6 shrink-0 text-yellow-600 dark:text-yellow-400"
              >
                <path d="M16 6H3" />
                <path d="M12 12H3" />
                <path d="M12 18H3" />
                <path d="M21 15V6" />
                <circle cx="18.5" cy="15.5" r="2.5" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Playliste
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setPlaylistsOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-yellow-600 dark:text-neutral-300 dark:hover:text-yellow-400"
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
        ) : favArchiveOpen ? (
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
                className="h-6 w-6 shrink-0 text-amber-500 dark:text-amber-400"
              >
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Arhiv priljubljenih
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setFavArchiveOpen(false)}
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
        ) : queueOpen ? (
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
                <path d="M21 15V6" />
                <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path d="M12 12H3" />
                <path d="M16 6H3" />
                <path d="M12 18H3" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Čakalna vrsta
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setQueueOpen(false)}
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
        ) : reviewOpen ? (
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
                className="h-6 w-6 shrink-0 text-teal-600 dark:text-teal-400"
              >
                <path d="M21.8 10A10 10 0 1 1 17 3.34" />
                <path d="m9 11 3 3L22 4" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Pregled in odobritev
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-teal-600 dark:text-neutral-300 dark:hover:text-teal-400"
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
        ) : fixOpen ? (
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
                className="h-6 w-6 shrink-0 text-yellow-500 dark:text-yellow-400"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                Popravi skladbe
              </span>
            </h1>
            <button
              type="button"
              onClick={() => setFixOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-yellow-600 dark:text-neutral-300 dark:hover:text-yellow-400"
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
              <h1>
                <button
                  type="button"
                  onClick={handleHardRefresh}
                  title="Osveži aplikacijo"
                  className="flex items-center gap-2 text-left"
                >
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
                  <span className="text-2xl font-semibold tracking-tight text-neutral-900 drop-shadow-[0_1px_3px_rgba(0,0,0,0.15)] dark:text-white dark:drop-shadow-[0_1px_6px_rgba(255,255,255,0.15)]">
                    Bitne Tabs
                  </span>
                </button>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (voiceAddOpen) {
                    setVoiceAddOpen(false);
                  } else if (quickAddOpen) {
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
                <span className="hidden text-sm font-medium lg:inline">
                  Dodaj nov komad
                </span>
              </button>
              {/* "Skupno": skladbe drugih uporabnikov (uvoz v mojo knjižnico). */}
              <button
                type="button"
                data-view-toggle
                onClick={() => {
                  if (sharedOn) {
                    closeShared();
                  } else {
                    setActiveView("list");
                    setSharedError(null);
                    setSharedSongs(null);
                    setSharedOn(true);
                  }
                }}
                aria-pressed={sharedOn}
                aria-label="Skupno"
                title="Skupno — skladbe drugih uporabnikov, uvozi jih v svojo knjižnico"
                className={`ml-1.5 inline-flex items-center justify-center rounded-full border border-sky-500/50 p-2.5 transition dark:border-sky-400/50 ${
                  sharedOn
                    ? "bg-[linear-gradient(115deg,#0284c7_15%,#38bdf8_100%)] text-white"
                    : "bg-transparent text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
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
                  className="h-[18px] w-[18px] shrink-0"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
              <div className="ml-1.5">
                <SettingsMenu
                  user={user}
                  onImported={(imported) =>
                    setSongs((prev) => [...imported, ...prev])
                  }
                  onOpenGoal={() => {
                    setJamOpen(false);
                    setFixOpen(false);
                    setQueueOpen(false);
                    setFavArchiveOpen(false);
                    setReviewOpen(false);
                    setPlaylistsOpen(false);
                    setGoalOpen(true);
                  }}
                  queuedSongs={queuedSongs}
                  queuedError={queuedError}
                  onRemoveQueued={handleRemoveQueued}
                  onOpenQueue={openQueue}
                  reports={reports}
                  reportsError={reportsError}
                  onRefreshLists={() => {
                    refreshReports();
                    refreshQueued();
                  }}
                  onOpenFix={openFix}
                  onOpenReview={openReview}
                  reviewCount={reviewSongs.length}
                  onOpenFavArchive={openFavArchive}
                  onOpenJamArchive={() => {
                    setGoalOpen(false);
                    setFixOpen(false);
                    setQueueOpen(false);
                    setFavArchiveOpen(false);
                    setReviewOpen(false);
                    setPlaylistsOpen(false);
                    setJamOpen(true);
                    openJamArchive();
                    window.scrollTo({ top: 0 });
                  }}
                  favArchiveMonthCount={favoriteArchiveMonths(songs).length}
                />
              </div>
            </div>
          </>
        )}
      </header>

      {/* Napredni urejevalnik besedila z akordi (portal čez cel zaslon) — odpre ga
          "Uredi besedilo" na straneh Popravi skladbe in Pregled in odobritev. */}
      {chordsEditSong && (
        <ChordsTextEditor
          song={chordsEditSong}
          onClose={() => {
            setChordsEditSong(null);
            if (editorFromViewer) {
              setEditorFromViewer(false);
              openChordsViewer(chordsEditSong.id);
            }
          }}
          onSaved={(chordsText) =>
            setSongs((prev) =>
              prev.map((x) => (x.id === chordsEditSong.id ? { ...x, chords_text: chordsText } : x)),
            )
          }
        />
      )}

      {jamOpen ? (
        <div className="mt-3! space-y-4">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={toggleJamShared}
              aria-pressed={jamShared}
              className={`inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 px-4 py-1.5 text-sm font-medium transition ${
                jamShared ? "bg-fuchsia-600 text-white" : "text-neutral-600 dark:text-neutral-300"
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
                className="h-4 w-4 shrink-0"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {jamShared ? "Skupni Jam · nazaj na moj Jam" : "Skupni Jam"}
            </button>
            {presenceDots}
          </div>
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          {jamArchiveOpen ? (
            <JamArchive
              entries={jamHistory}
              songs={songs}
              error={jamHistoryError}
              renderSongCard={(song) => (
                <>
                  <SongCard
                    song={song}
                    authorImage={authorImages[song.author] ?? null}
                    onEdit={handleEdit}
                    onFilterAuthor={(author) => {
                      setJamOpen(false);
                      setJamArchiveOpen(false);
                      handleFilterByAuthor(author);
                    }}
                    onAddToJam={handleAddToJam}
                    onAddToSharedJam={handleAddToSharedJam}
                    onChordsClick={handleChordsClick}
                    onReported={handleReported}
                    onSendToReview={handleSendToReview}
                    onToggleFavorite={handleToggleFavorite}
                  />
                  {renderEditForm(song)}
                </>
              )}
            />
          ) : (
          <>
          {jamShared ? (
            <>
              {sharedJamError && <p className="text-sm text-red-600 dark:text-red-400">{sharedJamError}</p>}
              {sharedLeader && !amLeader && !followingLeader && (
                <button
                  type="button"
                  onClick={followLeader}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/10 px-4 py-2.5 text-left text-sm text-neutral-800 transition hover:bg-fuchsia-500/20 dark:text-neutral-200"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{sharedLeader.name}</span> ima odprte akorde
                    {leaderSong ? `: ${leaderSong.title}` : ""}
                  </span>
                  <span className="shrink-0 rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-medium text-white">Sledi</span>
                </button>
              )}
              <JamBoard
                items={sharedBoardItems}
                librarySongs={songs}
                excludeIds={sharedJamSongIds}
                onAddSong={(song) => addToSharedJam(song, song.title, song.author)}
                onQuickAdd={(title, author) => addToSharedJam(null, title, author)}
                onTogglePlayed={(item) => handleToggleSharedJamPlayed(item.key)}
                onRemove={(item) => handleRemoveSharedJam(item.key)}
                // Popularnost (copy_count) samo za lastne skladbe.
                onChordsClick={(song) => {
                  if (song.user_id === user.id) handleChordsClick(song);
                }}
                showAddedBy
              />
            </>
          ) : (
            <JamBoard
              items={privateBoardItems}
              librarySongs={songs}
              excludeIds={jamSongIds}
              onAddSong={handleAddToJam}
              onQuickAdd={addJamExtra}
              onTogglePlayed={(board) => {
                const item = jamItems.find((x) => x.key === board.key);
                if (!item) return;
                if (item.kind === "song") handleToggleJamPlayed(item.song);
                else handleToggleJamExtraPlayed(item.extra);
              }}
              onRemove={(board) => {
                const item = jamItems.find((x) => x.key === board.key);
                if (!item) return;
                if (item.kind === "song") handleRemoveFromJam(item.song);
                else handleRemoveJamExtra(item.extra);
              }}
              onChordsClick={handleChordsClick}
            />
          )}
          </>
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
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Ni zadetkov.
                </p>
              )}
              <div className="space-y-1.5">
                {goalPickerResults.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => handleAddToGoal(song)}
                    className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-amber-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-amber-400"
                  >
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {song.title}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {" "}
                      — {song.author}
                    </span>
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
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {goalQuickAddError}
                    </p>
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
                      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
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
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {item.author}
                        </p>
                        {/* Naslov in avtor zgoraj, Akordi + Poslušaj pod njima. */}
                        {item.kind === "song" && (
                          <div className="mt-1.5">
                            <ChordsButtons song={item.song} onChordsClick={handleChordsClick} merged />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          item.kind === "song"
                            ? handleRemoveFromGoal(item.song)
                            : handleRemoveGoalExtra(item.extra)
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
      ) : playlistsOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />
          <Playlists
            songs={songs}
            renderSongCard={(song) => (
              <>
                <SongCard
                  song={song}
                  authorImage={authorImages[song.author] ?? null}
                  onEdit={handleEdit}
                  onFilterAuthor={(author) => {
                    setPlaylistsOpen(false);
                    handleFilterByAuthor(author);
                  }}
                  onAddToJam={handleAddToJam}
                  onAddToSharedJam={handleAddToSharedJam}
                  onChordsClick={handleChordsClick}
                  onReported={handleReported}
                  onSendToReview={handleSendToReview}
                  onToggleFavorite={handleToggleFavorite}
                />
                {renderEditForm(song)}
              </>
            )}
          />
        </div>
      ) : favArchiveOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />
          <FavoritesArchive
            songs={songs}
            authorImages={authorImages}
            onFilterAuthor={(author) => {
              setFavArchiveOpen(false);
              handleFilterByAuthor(author);
            }}
            onChordsClick={handleChordsClick}
            onAddToJam={handleAddToJam}
            onAddToSharedJam={handleAddToSharedJam}
          />
        </div>
      ) : queueOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full border border-fuchsia-500/30 p-1 text-sm dark:border-fuchsia-400/30">
            {QUEUE_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={queueTab === tab}
                onClick={() => setQueueTab(tab)}
                className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition ${
                  queueTab === tab
                    ? "bg-fuchsia-600 text-white"
                    : "text-neutral-600 hover:bg-fuchsia-500/10 dark:text-neutral-300"
                }`}
              >
                {QUEUE_TAB_LABELS[tab]}
                {tab === "queue" && queuedSongs.length > 0 && ` (${queuedSongs.length})`}
              </button>
            ))}
          </div>

          {queueTab === "reports" ? (
            <ImportReports batches={importBatches} error={importBatchesError} />
          ) : queueTab === "history" ? (
            <ImportHistory
              batches={importBatches}
              songs={songs}
              error={importBatchesError}
              onEditSong={(s) => (editing?.id === s.id ? closeForm() : handleEdit(s))}
              renderEditForm={renderEditForm}
            />
          ) : (
          <>
          {queuedError && (
            <p className="text-sm text-red-600 dark:text-red-400">{queuedError}</p>
          )}

          {queuedSongs.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Čakalna vrsta je prazna.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {queuedSongs.map((q) => {
                const adding = queueAddingId === q.id && showForm;
                return (
                  <div
                    key={q.id}
                    className="overflow-hidden rounded-2xl border-2 border-fuchsia-500/50 bg-fuchsia-500/[0.05] shadow-sm dark:border-fuchsia-400/40 dark:bg-fuchsia-400/[0.05]"
                  >
                    <div className="space-y-0.5 px-4 pb-2 pt-3">
                      <p className="truncate text-lg font-medium text-neutral-900 lg:text-base dark:text-neutral-100">
                        {q.title}
                      </p>
                      <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                        {q.author}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        Dodano {new Date(q.added_at).toLocaleDateString("sl-SI")}
                      </p>
                    </div>

                    <div className="border-t border-dashed border-fuchsia-500/40 px-3 pb-3 pt-2.5 dark:border-fuchsia-400/30">
                      {confirmRemoveQueuedId === q.id ? (
                        <div className="space-y-1.5 rounded-lg border border-red-500/40 bg-red-500/5 p-2">
                          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                            Odstranim skladbo iz čakalne vrste?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmRemoveQueuedId(null);
                                handleRemoveQueued(q.id);
                              }}
                              className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                            >
                              Da, odstrani
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveQueuedId(null)}
                              className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                            >
                              Ne
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              adding ? closeForm() : handleAddQueuedToLibrary(q)
                            }
                            className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            {adding ? "Zapri obrazec" : "Dodaj v knjižnico"}
                          </button>
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(
                              `${q.author} ${q.title} Chords`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 rounded-lg border border-sky-500/50 px-2 py-1.5 text-center text-xs font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
                          >
                            Spletno iskanje
                          </a>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveQueuedId(q.id)}
                            aria-label="Odstrani iz čakalne vrste"
                            title="Odstrani iz čakalne vrste"
                            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-neutral-500 hover:border-red-500 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-red-400"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-[14px] w-[14px]"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {adding && (
                      <div id="song-form" className="border-t border-dashed border-fuchsia-500/40 px-2 pb-2 pt-2 dark:border-fuchsia-400/30">
                        <SongForm
                          key={`queue:${q.id}`}
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
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>
      ) : reviewOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          {reviewError && (
            <p className="text-sm text-red-600 dark:text-red-400">{reviewError}</p>
          )}

          {reviewSongs.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Ni skladb za pregled. Nove skladbe iz čakalne vrste se pokažejo tukaj, ko jih obdela Claude.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Preglej akorde vsake skladbe in jo odobri — šele potem je med vsemi skladbami.
                  Popravke narediš v meniju kartice (Uredi), napačno skladbo izbrišeš.
                </p>
                {reviewSongs.length > 1 && (
                  <button
                    type="button"
                    disabled={approvingIds.size > 0 || !reviewSongs.some(reviewReady)}
                    title="Odobri vse skladbe, ki imajo preverjene akorde in predvajalnik"
                    onClick={() => {
                      const ready = reviewSongs.filter(reviewReady);
                      if (window.confirm(`Odobrim ${ready.length} preverjenih skladb?`)) handleApprove(ready);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-teal-500/60 px-4 py-2 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-400"
                  >
                    Odobri vse preverjene ({reviewSongs.filter(reviewReady).length}/{reviewSongs.length})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reviewSongs.map((song) => (
                  <div
                    key={song.id}
                    className="overflow-hidden rounded-2xl border-2 border-teal-500/60 bg-teal-500/[0.06] shadow-sm dark:border-teal-400/50 dark:bg-teal-400/[0.05]"
                  >
                    {/* Glava: klik razpre/pospravi nastavitve pod kartico. */}
                    <button
                      type="button"
                      onClick={() => toggleReviewExpanded(song.id)}
                      aria-expanded={reviewExpanded.has(song.id)}
                      title={reviewExpanded.has(song.id) ? "Pospravi nastavitve" : "Pokaži nastavitve"}
                      className="flex w-full items-center gap-1.5 bg-teal-500/15 px-3 py-1.5 text-left text-xs font-semibold text-teal-800 transition hover:bg-teal-500/25 dark:bg-teal-400/15 dark:text-teal-300 dark:hover:bg-teal-400/25"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-[13px] w-[13px] shrink-0"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3.5 2" />
                      </svg>
                      Čaka na odobritev
                      {/* Stanje preverjanja tudi, ko so nastavitve pospravljene. */}
                      <span className="ml-1 font-medium text-teal-700/80 dark:text-teal-300/80">
                        {reviewReady(song)
                          ? "· pripravljena"
                          : `· ${[song.verified_chords_at ? "✓ akordi" : null, song.verified_player_at ? "✓ predvajalnik" : null].filter(Boolean).join(", ") || "ni preverjena"}`}
                      </span>
                      <span className="ml-auto font-medium text-teal-700/80 dark:text-teal-300/80">
                        {new Date(song.created_at).toLocaleDateString("sl-SI")}
                      </span>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-3.5 w-3.5 shrink-0 transition ${reviewExpanded.has(song.id) ? "rotate-180" : ""}`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    <div className="p-2">
                      <SongCard
                        song={song}
                        authorImage={authorImages[song.author] ?? null}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                      {renderEditForm(song)}
                    </div>
                    {reviewExpanded.has(song.id) && (
                    <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-teal-500/50 px-3 pb-3 pt-2.5 text-xs text-neutral-600 dark:border-teal-400/40 dark:text-neutral-300">
                      <span>{song.genre}</span>
                      <span>{formatEraLabel(song.era)}</span>
                      {song.mood && <span>{song.mood}</span>}
                      {song.origin && <span>{song.origin}</span>}
                      {!song.chords_text && (
                        <span className="text-amber-600 dark:text-amber-400">brez akordov v aplikaciji</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setChordsEditSong(song)}
                        title="Napredni urejevalnik besedila z akordi in tablatur"
                        className="ml-auto inline-flex items-center rounded-full border border-orange-400/60 px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-400/10 dark:text-orange-300"
                      >
                        Uredi besedilo
                      </button>
                      <button
                        type="button"
                        disabled={approvingIds.has(song.id) || !reviewReady(song)}
                        title={reviewReady(song) ? "Odobri" : "Najprej potrdi: akordi preverjeni in predvajalnik preverjen"}
                        onClick={() => handleApprove([song])}
                        className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4 shrink-0"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        {approvingIds.has(song.id) ? "Odobravam…" : "Odobri"}
                      </button>
                    </div>
                    {/* Oboje mora biti potrjeno, preden se skladba lahko odobri. */}
                    <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-xs">
                      <button
                        type="button"
                        aria-pressed={!!song.verified_chords_at}
                        onClick={() => handleVerify(song, "verified_chords_at", song.verified_chords_at ? null : new Date().toISOString())}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                          song.verified_chords_at
                            ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-neutral-400/60 text-neutral-600 hover:border-emerald-500/70 dark:text-neutral-300"
                        }`}
                      >
                        {song.verified_chords_at ? "✓ Akordi preverjeni" : "Akordi preverjeni?"}
                      </button>
                      <button
                        type="button"
                        aria-pressed={!!song.verified_player_at}
                        disabled={!song.chords_text}
                        title={
                          song.verified_player_at
                            ? "Klik razveljavi oznako"
                            : "Označi, da Smart play pri tej skladbi dela dobro (časi in posnetek se zaklenejo ob naslednjem predvajanju)"
                        }
                        onClick={() => {
                          if (song.verified_player_at) {
                            if (window.confirm("Razveljavim oznako \"Predvajalnik preverjen\"?")) handleVerify(song, "verified_player_at", null);
                            return;
                          }
                          // Samo oznaka; čase in posnetek pregledovalnik zamrzne ob
                          // naslednjem predvajanju (ChordsViewer, samodejna zamrznitev).
                          handleVerify(song, "verified_player_at", new Date().toISOString());
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                          song.verified_player_at
                            ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-neutral-400/60 text-neutral-600 hover:border-emerald-500/70 dark:text-neutral-300"
                        }`}
                      >
                        {song.verified_player_at ? "✓ Predvajalnik preverjen" : "Predvajalnik preverjen?"}
                      </button>
                      {!reviewReady(song) && (
                        <span className="text-neutral-500 dark:text-neutral-400">Odobritev je mogoča po obeh potrditvah.</span>
                      )}
                    </div>
                    </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : fixOpen ? (
        <div className="mt-3! space-y-4">
          <hr className="border-t border-neutral-200 dark:border-neutral-800" />

          {reportsError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {reportsError}
            </p>
          )}

          {fixItems.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Ni prijavljenih napak — vse skladbe so v redu.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fixItems.map(({ song, songReports }) => (
                // En "issue": kartica skladbe + prijave + urejanje v enem
                // rumeno obrobljenem okvirju, da je jasno, kaj sodi skupaj.
                <div
                  key={song.id}
                  className="overflow-hidden rounded-2xl border-2 border-yellow-500/60 bg-yellow-500/[0.06] shadow-sm dark:border-yellow-400/50 dark:bg-yellow-400/[0.05]"
                >
                  <div className="flex items-center gap-1.5 bg-yellow-500/15 px-3 py-1.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-300">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-[13px] w-[13px] shrink-0"
                    >
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    Za popravilo
                    <span className="ml-auto font-medium text-yellow-700/80 dark:text-yellow-300/80">
                      {songReports.length === 1
                        ? "1 prijava"
                        : songReports.length === 2
                          ? "2 prijavi"
                          : songReports.length <= 4
                            ? `${songReports.length} prijave`
                            : `${songReports.length} prijav`}
                    </span>
                  </div>
                  <div className="p-2">
                    <SongCard
                      song={song}
                      authorImage={authorImages[song.author] ?? null}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onAddToJam={handleAddToJam}
                      onAddToSharedJam={handleAddToSharedJam}
                      onChordsClick={handleChordsClick}
                      onReported={handleReported}
                      onSendToReview={handleSendToReview}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  </div>
                  <div className="relative space-y-2 border-t border-dashed border-yellow-500/50 px-3 pb-3 pt-2.5 text-sm dark:border-yellow-400/40">
                    <ul className="space-y-1.5">
                      {songReports.map((r) => (
                        <li key={r.id} className="flex items-start gap-1.5">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="mt-0.5 h-[14px] w-[14px] shrink-0 text-yellow-500 dark:text-yellow-400"
                          >
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                            <path d="M12 9v4M12 17h.01" />
                          </svg>
                          {noteEditId === r.id ? (
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="Kaj je narobe?"
                                className="w-full resize-none rounded-lg border border-neutral-300 bg-white/80 px-2 py-1.5 text-sm text-neutral-800 outline-none focus:border-yellow-500 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100"
                              />
                              <div className="flex gap-1.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleSaveReportNote(r)}
                                  disabled={noteSaving}
                                  className="flex-1 rounded-lg bg-yellow-500 px-2 py-1 font-medium text-neutral-900 hover:bg-yellow-400 disabled:opacity-50"
                                >
                                  {noteSaving ? "Shranjujem…" : "Shrani"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNoteEditId(null)}
                                  disabled={noteSaving}
                                  className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-neutral-600 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                                >
                                  Prekliči
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">
                                  {r.note || (
                                    <span className="italic text-neutral-400 dark:text-neutral-500">
                                      Brez opisa.
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                  {new Date(r.reported_at).toLocaleDateString(
                                    "sl-SI",
                                  )}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNoteEditId(r.id);
                                  setNoteDraft(r.note ?? "");
                                }}
                                aria-label="Uredi opis napake"
                                title="Uredi opis napake"
                                className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-yellow-500/15 hover:text-yellow-700 dark:text-neutral-400 dark:hover:text-yellow-300"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.8}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-[14px] w-[14px]"
                                >
                                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                                  <path d="m15 5 4 4" />
                                </svg>
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    {confirmResolveId === song.id ? (
                      // Dvostopenjska potrditev — "Popravljeno" izbriše vse
                      // prijave te skladbe, zato še enkrat vprašamo.
                      <div className="space-y-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2">
                        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          Je bila skladba res popravljena?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmResolveId(null);
                              handleResolveReports(songReports);
                            }}
                            className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Da, popravljena
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResolveId(null)}
                            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                          >
                            Ne še
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            editing?.id === song.id
                              ? closeForm()
                              : handleEdit(song)
                          }
                          className="rounded-lg border border-sky-500/50 px-2 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-400"
                        >
                          {editing?.id === song.id ? "Zapri urejanje" : "Uredi"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResolveId(song.id)}
                          className="rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                        >
                          ✓ Popravljeno
                        </button>
                        <button
                          type="button"
                          onClick={() => setChordsEditSong(song)}
                          title="Napredni urejevalnik besedila z akordi in tablatur"
                          className="rounded-lg border border-orange-400/60 px-2 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-400/10 dark:text-orange-300"
                        >
                          Uredi besedilo
                        </button>
                      </div>
                    )}
                  </div>
                  {editing?.id === song.id && (
                    <div className="border-t border-dashed border-yellow-500/50 px-2 pb-2 dark:border-yellow-400/40">
                      {renderEditForm(song)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {!isSupabaseConfigured && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Supabase še ni nastavljen. Kopiraj{" "}
              <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">
                .env.local.example
              </code>{" "}
              v{" "}
              <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">
                .env.local
              </code>
              , vnesi URL in anon ključ svojega Supabase projekta ter poženi{" "}
              <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">
                supabase/schema.sql
              </code>{" "}
              v SQL Editorju, nato ponovno zaženi{" "}
              <code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">
                npm run dev
              </code>
              .
            </div>
          )}

          {partialOpen && partialDimension && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  🔀 Delno naključno — {PARTIAL_LABELS[partialDimension]}
                </p>
                <button
                  onClick={() => setPartialOpen(false)}
                  aria-label="Zapri"
                  title="Zapri"
                  className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  ✕
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
                        : partialDimension === "origin"
                          ? usedOrigins
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
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {partialError}
                </p>
              )}
            </div>
          )}

          {randomPick && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  🎲 Naključno izbrana skladba
                </p>
                <button
                  onClick={() => {
                    setRandomPick(null);
                    setRandomFive(null);
                  }}
                  aria-label="Zapri"
                  title="Zapri"
                  className="text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  ✕
                </button>
              </div>
              <SongCard
                song={randomPick}
                authorImage={authorImages[randomPick.author] ?? null}
                onEdit={handleEdit}
                onAddSimilar={handleAddSimilar}
                onFilterAuthor={handleFilterByAuthor}
                onAddToJam={handleAddToJam}
                onAddToSharedJam={handleAddToSharedJam}
                onChordsClick={handleChordsClick}
                onReported={handleReported}
                onSendToReview={handleSendToReview}
                onToggleFavorite={handleToggleFavorite}
                highlighted
              />
              {renderEditForm(randomPick)}
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  onClick={pickRandomFive}
                  aria-label="Prikaži 5 naključnih skladb"
                  title="Prikaži 5 naključnih skladb"
                  className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/40 px-3 py-1 text-sm text-neutral-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-emerald-400/40 dark:text-neutral-300 dark:hover:text-emerald-400"
                >
                  ↻ 5
                </button>
                <button
                  onClick={handlePickAnother}
                  className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/40 px-3 py-1 text-sm text-neutral-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-emerald-400/40 dark:text-neutral-300 dark:hover:text-emerald-400"
                >
                  ↻ Izberi drugo
                </button>
              </div>

              {randomFive && (
                <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  {randomFive.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      Ni dovolj skladb za prikaz.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {randomFive.map((song) => (
                        <div key={song.id}>
                          <SongCard
                            song={song}
                            authorImage={authorImages[song.author] ?? null}
                            onEdit={handleEdit}
                            onAddSimilar={handleAddSimilar}
                            onFilterAuthor={handleFilterByAuthor}
                            onAddToJam={handleAddToJam}
                            onAddToSharedJam={handleAddToSharedJam}
                            onChordsClick={handleChordsClick}
                            onReported={handleReported}
                            onSendToReview={handleSendToReview}
                            onToggleFavorite={handleToggleFavorite}
                          />
                          {randomPick?.id !== song.id && renderEditForm(song)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              <AddChoiceIcons
                onVoice={() => {
                  setAddChoiceOpen(false);
                  setVoiceAddOpen(true);
                }}
                onQuick={() => {
                  setAddChoiceOpen(false);
                  setQuickAddOpen(true);
                }}
                onPhone={() => {
                  setAddChoiceOpen(false);
                  setEditing(null);
                  setPrefillDraft(null);
                  setShowForm(true);
                }}
              />
            </div>
          )}

          {voiceAddOpen && (
            <VoiceQuickAdd
              onCancel={() => setVoiceAddOpen(false)}
              onAdd={(title, author) => addToQueue(title, author)}
            />
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
                value={quickAddAuthor}
                onChange={(e) => setQuickAddAuthor(e.target.value)}
                placeholder="Avtor"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
              />
              <input
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                placeholder="Naslov skladbe"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
              />
              {quickAddError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {quickAddError}
                </p>
              )}
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
                key={
                  prefillDraft
                    ? `prefill:${prefillDraft.title}|${prefillDraft.author}`
                    : "new"
                }
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
              <div
                className={`relative lg:w-1/2 lg:max-w-xs lg:flex-none ${
                  searchWide ? "min-w-0 flex-1" : "w-1/4"
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
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rose-600 dark:text-rose-400"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={filters.search}
                  onChange={(e) =>
                    handleFiltersChange({ ...filters, search: e.target.value })
                  }
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  // Enter na telefonski tipkovnici zapre tipkovnico (rezultati so že spodaj).
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  enterKeyHint="search"
                  disabled={!isSupabaseConfigured}
                  aria-label="Išči po naslovu ali avtorju"
                  className="w-full rounded-full border border-rose-500/40 bg-[linear-gradient(115deg,rgba(225,29,72,0.14)_15%,rgba(225,29,72,0.03)_95%)] py-2 pl-10 pr-9 text-sm text-neutral-800 transition focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.24)_15%,rgba(225,29,72,0.06)_95%)] focus:outline-none disabled:opacity-40 dark:border-rose-400/40 dark:text-neutral-200 dark:focus:bg-[linear-gradient(115deg,rgba(225,29,72,0.32)_15%,rgba(225,29,72,0.1)_95%)]"
                />
                {/* Placeholder as an overlay so it can be shorter on phones
                    (a native placeholder can't change text per breakpoint). */}
                {!filters.search && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm text-neutral-500 lg:left-10 ${
                      isSupabaseConfigured ? "" : "opacity-40"
                    }`}
                  >
                    <span className="lg:hidden">Išči</span>
                    <span className="hidden lg:inline">
                      Išči po naslovu ali avtorju…
                    </span>
                  </span>
                )}
                {filters.search && (
                  <button
                    type="button"
                    onClick={() =>
                      handleFiltersChange({ ...filters, search: "" })
                    }
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
                  setFixOpen(false);
                  setQueueOpen(false);
                  setFavArchiveOpen(false);
                  setReviewOpen(false);
                  setPlaylistsOpen(false);
                }}
                disabled={!isSupabaseConfigured}
                aria-pressed={jamOpen}
                aria-label="Jam"
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-fuchsia-500/40 py-2 ${searchWide ? "px-2.5 lg:px-4" : "px-4"} text-sm font-medium transition disabled:opacity-40 dark:border-fuchsia-400/40 ${
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
                <span className={searchWide ? "hidden lg:inline" : ""}>Jam</span>
              </button>

              <button
                type="button"
                onClick={openPlaylists}
                disabled={!isSupabaseConfigured}
                aria-pressed={playlistsOpen}
                aria-label="Playliste"
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-500/40 py-2 ${searchWide ? "px-2.5 lg:px-4" : "px-4"} text-sm font-medium transition disabled:opacity-40 dark:border-yellow-400/40 ${
                  playlistsOpen
                    ? "bg-[linear-gradient(115deg,#a16207_15%,#facc15_100%)] text-white"
                    : "bg-[linear-gradient(115deg,rgba(202,138,4,0.14)_15%,rgba(202,138,4,0.03)_95%)] text-neutral-800 hover:bg-[linear-gradient(115deg,rgba(202,138,4,0.24)_15%,rgba(202,138,4,0.06)_95%)] dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(202,138,4,0.32)_15%,rgba(202,138,4,0.1)_95%)]"
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
                  className={`h-4 w-4 shrink-0 ${playlistsOpen ? "text-white" : "text-yellow-600 dark:text-yellow-400"}`}
                >
                  <path d="M16 6H3" />
                  <path d="M12 12H3" />
                  <path d="M12 18H3" />
                  <path d="M21 15V6" />
                  <circle cx="18.5" cy="15.5" r="2.5" />
                </svg>
                <span className={searchWide ? "hidden lg:inline" : ""}>Playliste</span>
              </button>
            </div>

            {/* Telefon: med iskanjem (polje v fokusu) se vrstica Naključno/Delno/Novo/Popularno/Filtri
                pomakne gor in izgine, ob zaprtju iskanja se vrne. Na računalniku (lg:contents) brez učinka. */}
            <div
              className={`flex flex-nowrap items-center gap-2 overflow-x-auto transition-all duration-300 ease-out lg:contents ${
                searchFocused ? "pointer-events-none mb-0! max-h-0 -translate-y-2 opacity-0 lg:pointer-events-auto" : "max-h-16 opacity-100"
              }`}
            >
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

            <div
              className={`flex flex-nowrap items-center gap-2 overflow-x-auto transition-all duration-300 ease-out lg:contents ${
                searchFocused ? "pointer-events-none mb-0! max-h-0 -translate-y-2 opacity-0 lg:pointer-events-auto" : "max-h-16 opacity-100"
              }`}
            >
              <button
                type="button"
                data-view-toggle
                onClick={() =>
                  setActiveView((v) => (v === "newest" ? "list" : "newest"))
                }
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
                    activeView === "newest"
                      ? "text-white"
                      : "text-emerald-600 dark:text-emerald-400"
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
                onClick={() =>
                  setActiveView((v) => (v === "popular" ? "list" : "popular"))
                }
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
              <FiltersToggle />
            </div>
          </div>

          <Filters
            filters={filters}
            onChange={handleFiltersChange}
            moodOptions={usedMoods}
            originOptions={usedOrigins}
          />

          {isSupabaseConfigured &&
            !loading &&
            !loadError &&
            activeView === "list" &&
            !sharedOn &&
            !hasActiveFilters(filters) && (
              <div className={`mt-3! space-y-0 ${searchFocused ? "hidden lg:block" : ""}`}>
                <FavoritesThisMonth
                  songs={songs}
                  othersSongs={othersFavorites}
                  ownerNames={ownerNames}
                  authorImages={authorImages}
                  onFilterAuthor={handleFilterByAuthor}
                  onChordsClick={handleChordsClick}
                  onAddToJam={handleAddToJam}
                  onAddToSharedJam={handleAddToSharedJam}
                />
                <VerifiedSongs
                  songs={verifiedSongs}
                  isOwn={(s) => s.user_id === user.id}
                  authorImages={authorImages}
                  onFilterAuthor={handleFilterByAuthor}
                  onChordsClick={handleChordsClick}
                  onAddToJam={handleAddToJam}
                  onAddToSharedJam={handleAddToSharedJam}
                />
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

          {/* Telefon: med iskanjem (polje v fokusu) je stran prazna — domači razdelki
              zgoraj se skrijejo, seznam pa se pokaže šele, ko je kaj vpisano (rezultati). */}
          <section
            data-view-section
            className={`mt-3! space-y-4 ${searchFocused && filters.search === "" ? "hidden lg:block" : ""}`}
          >
            {loading && (
              <p className="text-sm text-neutral-500">Nalagam skladbe…</p>
            )}
            {loadError && (
              <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
                Napaka pri nalaganju: {loadError}
              </p>
            )}

            {!loading &&
              !loadError &&
              activeView === "newest" &&
              (newestFirst.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Baza je še prazna — dodaj prvo skladbo.
                </p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Nedavno dodano
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {recentTop.map((song) => (
                        <CompactCard
                          key={song.id}
                          song={song}
                          onChordsClick={handleChordsClick}
                        />
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
              ))}

            {!loading &&
              !loadError &&
              activeView === "popular" &&
              (mostPopular.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Baza je še prazna — dodaj prvo skladbo.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    Top 5
                  </p>
                  {mostPopular.slice(0, 5).map((song, i) => (
                    <CompactRow
                      key={song.id}
                      song={song}
                      rank={i + 1}
                      onChordsClick={handleChordsClick}
                      highlighted
                    />
                  ))}
                  {mostPopular.slice(5).map((song, i) => (
                    <CompactRow
                      key={song.id}
                      song={song}
                      rank={i + 6}
                      onChordsClick={handleChordsClick}
                    />
                  ))}
                </div>
              ))}

            {!loading && !loadError && activeView === "list" && (
              <>
                <div ref={listHeadingRef} className="flex scroll-mt-4 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {/* Brez filtra je naslov (in prazen prostor desno do puščice) zložljiv —
                        isti vzorec kot ostali razdelki domače strani; z filtrom je desno "Nazaj". */}
                    <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                      {sharedOn || hasActiveFilters(filters) || authorFilter ? (
                        sharedOn ? "Skupno" : songsHeading
                      ) : (
                        <button
                          type="button"
                          onClick={() => setStoredSongsVisible(songsVisible ? "0" : "1")}
                          aria-expanded={songsVisible}
                          className="text-left"
                        >
                          {songsHeading}
                        </button>
                      )}
                    </h2>
                    {/* Razvrščanje ("Filter") samo, ko je seznam odprt. */}
                    {(sharedOn || songsVisible || hasActiveFilters(filters) || authorFilter) && (
                      <SortMenu value={songSort} onChange={setSongSort} />
                    )}
                    {/* "Pojdi na dno": telefon samo z odprtim seznamom, računalnik vedno. */}
                    <button
                      type="button"
                      onClick={scrollToListBottom}
                      className={`shrink-0 items-center gap-1 rounded-full border border-neutral-400/40 bg-white/70 px-2 py-1 text-xs font-medium leading-none text-neutral-600 transition hover:border-neutral-500 hover:text-neutral-800 dark:border-neutral-500/40 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:text-white ${
                        sharedOn || songsVisible || hasActiveFilters(filters) || authorFilter ? "inline-flex" : "hidden lg:inline-flex"
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
                        className="h-[13px] w-[13px] shrink-0"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      Pojdi na dno
                    </button>
                  </div>
                  {sharedOn || hasActiveFilters(filters) || authorFilter ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (sharedOn) closeShared();
                        handleBackFromFilter();
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
                      onClick={() => setStoredSongsVisible(songsVisible ? "0" : "1")}
                      aria-expanded={songsVisible}
                      aria-label={songsVisible ? "Skrij komade" : "Prikaži komade"}
                      title={songsVisible ? "Skrij komade" : "Prikaži komade"}
                      className="flex min-h-9 flex-1 items-center justify-end self-stretch"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform ${songsVisible ? "" : "-rotate-90"}`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>

                {sharedOn && (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Skladbe drugih uporabnikov. V meniju kartice jih uvoziš v svojo knjižnico
                      (akordi, povezave in besedilo pridejo zraven).
                    </p>
                    {sharedError && (
                      <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
                        Napaka pri nalaganju: {sharedError}
                      </p>
                    )}
                    {!sharedSongs && !sharedError && (
                      <p className="text-sm text-neutral-500">Nalagam skupne skladbe…</p>
                    )}
                    {(() => {
                      const importable = displaySongs.filter((s) => !inMyLibrary(s));
                      return (
                        importable.length > 0 && (
                          <button
                            type="button"
                            disabled={importBusy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Uvozim ${importable.length} ${importable.length === 1 ? "skladbo" : "skladb"} v tvojo knjižnico?`,
                                )
                              )
                                handleImportShared(importable);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:border-emerald-400/50 dark:text-emerald-400"
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
                              <path d="M12 3v12" />
                              <path d="m7 10 5 5 5-5" />
                              <path d="M5 21h14" />
                            </svg>
                            {importBusy ? "Uvažam…" : `Uvozi vse prikazane (${importable.length})`}
                          </button>
                        )
                      );
                    })()}
                    {importMessage && (
                      <p
                        className={`rounded-lg px-3 py-2 text-sm ${
                          importMessage.error
                            ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        }`}
                      >
                        {importMessage.text}
                      </p>
                    )}
                  </div>
                )}

                {(sharedOn || songsVisible || hasActiveFilters(filters)) && (
                  <>
                    {displaySongs.length === 0 && (!sharedOn || sharedSongs) && (
                      <p className="text-sm text-neutral-500">
                        {sharedOn
                          ? sharedSongs?.length
                            ? "Nobena skladba ne ustreza izbranim filtrom."
                            : "Drugi uporabniki še nimajo skladb."
                          : songs.length === 0
                            ? "Tvoja knjižnica je še prazna — dodaj prvo skladbo ali jo uvozi iz \"Skupno\"."
                            : "Nobena skladba ne ustreza izbranim filtrom."}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {displaySongs.slice(0, visibleResults).map((song) =>
                        sharedOn ? (
                          <SongCard
                            key={song.id}
                            song={song}
                            authorImage={authorImages[song.author] ?? null}
                            onEdit={() => {}}
                            onFilterAuthor={handleFilterByAuthor}
                            onImport={(s) => handleImportShared([s])}
                            inLibrary={inMyLibrary(song)}
                          />
                        ) : (
                        <div key={song.id}>
                          <SongCard
                            song={song}
                            authorImage={authorImages[song.author] ?? null}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onAddSimilar={handleAddSimilar}
                            onFilterAuthor={handleFilterByAuthor}
                            onAddToJam={handleAddToJam}
                            onAddToSharedJam={handleAddToSharedJam}
                            onChordsClick={handleChordsClick}
                            onReported={handleReported}
                            onSendToReview={handleSendToReview}
                            onToggleFavorite={handleToggleFavorite}
                          />
                          {randomPick?.id !== song.id && renderEditForm(song)}
                        </div>
                        ),
                      )}
                    </div>
                    {displaySongs.length > visibleResults && (
                      <LoadMoreSentinel
                        // Nov opazovalec po vsaki strani: če je konec še vedno blizu zaslona, naloži naslednjo.
                        key={visibleResults}
                        onVisible={() => setResultsPage({ key: filtersKey, count: visibleResults + RESULTS_PAGE })}
                      />
                    )}
                    {/* Konec seznama (vse strani naložene): na sredini "Vrni se na vrh" — do naslova "Obdobja"
                        (domača stran); z iskanjem/filtrom ga ni, takrat do naslova seznama. */}
                    {displaySongs.length > 0 && displaySongs.length <= visibleResults && (
                      <div className="flex justify-center pt-2 pb-4">
                        <button
                          type="button"
                          onClick={() =>
                            (document.querySelector('[data-home-section="Obdobja"]') ?? listHeadingRef.current)?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
                            <path d="m18 15-6-6-6 6" />
                          </svg>
                          Vrni se na vrh
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}

      {(() => {
        const chordsSong = openChordsId
          ? [...allSongs, ...(sharedSongs ?? []), ...Object.values(sharedJamSongs), ...verifiedAll, ...othersFavorites].find((s) => s.id === openChordsId && s.chords_text)
          : undefined;
        return chordsSong ? (
          <ChordsViewer
            key={chordsSong.id + (openChordsMode ?? "")}
            song={chordsSong}
            onClose={closeChordsViewer}
            shared={viewerShared}
            samSpili={openChordsMode === "samspili"}
            autoRecord={openChordsMode === "record"}
            inFix={reportedSongIds.has(chordsSong.id)}
            onOpenEditor={
              chordsSong.user_id === user.id
                ? () => {
                    setEditorFromViewer(true);
                    setChordsEditSong(chordsSong);
                    closeChordsViewer();
                  }
                : undefined
            }
          />
        ) : null;
      })()}
    </div>
  );
}

// Konec prikazanega dela seznama zadetkov: ko pride blizu zaslona, naloži
// naslednjo stran (gumb za primer, da IntersectionObserver ne sproži).
function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onVisibleRef.current();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onVisibleRef.current()}
      className="mx-auto mt-4 block rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
    >
      Pokaži več
    </button>
  );
}

function CompactCard({
  song,
  onChordsClick,
}: {
  song: Song;
  onChordsClick?: (song: Song) => void;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 transition hover:-translate-y-0.5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
        {song.title}
      </p>
      <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
        {song.author}
      </p>
      <ChordsButtons song={song} onChordsClick={onChordsClick} merged />
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
          highlighted
            ? "text-orange-600 dark:text-orange-400"
            : "text-neutral-400 dark:text-neutral-600"
        }`}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
          {song.title}
        </p>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
          {song.author}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ChordsButtons
          song={song}
          onChordsClick={onChordsClick}
          stacked
          merged
          menuAlign="right"
        />
        <span
          title="Kolikokrat je bila kliknjena povezava Ultimate Guitar, PDF akordi ali Zabrenkaj"
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
              <p
                className="mb-1.5 truncate text-sm font-semibold"
                style={{ color: accent }}
              >
                {formatLabel(group.label)}
              </p>
              <div className="space-y-0.5">
                {group.songs.map((song) => (
                  <RecentGroupSongRow
                    key={song.id}
                    song={song}
                    onChordsClick={onChordsClick}
                  />
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
      <span className="w-full truncate text-sm text-neutral-800 dark:text-neutral-200">
        {song.title}
      </span>
      <span className="w-full truncate text-xs text-neutral-500 dark:text-neutral-400">
        {song.author}
      </span>
      <ChordsButtons song={song} onChordsClick={onChordsClick} merged />
    </div>
  );
}
