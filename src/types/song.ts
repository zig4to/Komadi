import type { Era, Genre } from "@/lib/constants";

export interface Song {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  era: Era;
  favorite: boolean;
  mood: string | null;
  origin: string | null;
  image_url: string | null;
  chords_url: string | null;
  chords_source_url: string | null;
  zabrenkaj_url: string | null;
  // Surov UG markup akordov ([ch]/[tab]) za vgrajen pregledovalnik
  // (ChordsViewer.tsx) — polni scripts/fill-chords-text.mjs, ne forma/uvoz.
  chords_text: string | null;
  // Akordi z druge strani (npr. pesmarica.rs), kadar jih ni na UG/zabrenkaj.si —
  // gumb v meniju "Akordi" dobi ime iz domene povezave (ChordsButtons.tsx).
  other_chords_url: string | null;
  // Kdaj je bila skladba označena kot priljubljena (null, če ni) — določa
  // mesec v "Priljubljeno ta mesec" / "Arhiv priljubljenih".
  favorited_at: string | null;
  youtube_url: string | null;
  // Točna povezava na Spotify skladbo / YouTube Music (albumska različica) —
  // polni ju skill dodaj-iz-cakalne-vrste; brez njiju ListenButton odpre iskanje.
  spotify_url: string | null;
  youtube_music_url: string | null;
  // Uvoz (batch) iz čakalne vrste, v katerem je bila skladba dodana — null
  // za ročno dodane in starejše skladbe. Glej ImportBatch spodaj.
  import_batch_id: string | null;
  copy_count: number;
  jam_added_at: string | null;
  jam_played: boolean;
  goal_added_at: string | null;
  goal_learned: boolean;
  created_at: string;
}

export type NewSong = Omit<
  Song,
  "id" | "created_at" | "copy_count" | "jam_added_at" | "jam_played" | "goal_added_at" | "goal_learned" | "youtube_url" | "spotify_url" | "youtube_music_url" | "import_batch_id" | "chords_text"
>;

export interface SimilarSong {
  title: string;
  author: string;
}

// Skladba dodana v Jam, ki je (še) ni v glavni knjižnici — glej gumb
// "Skladbe ni" in tabelo jam_extras v Dashboard.tsx.
// Ena skladba iz preteklega Jama (tabela jam_history) — song_id je null za
// "Skladbe ni" vnose in za skladbe, ki so bile medtem izbrisane iz knjižnice.
export interface JamHistoryEntry {
  id: string;
  song_id: string | null;
  title: string;
  author: string;
  added_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  created_at: string;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  added_at: string;
}

export interface JamExtra {
  id: string;
  title: string;
  author: string;
  added_at: string;
  played: boolean;
}

// Hitro predlagana skladba (naslov + avtor, brez ostalih podatkov) — glej
// gumb "Hitro" ob dodajanju nove skladbe in tabelo queued_songs. Prikazano
// in upravljano v SettingsMenu.tsx ("Čakalna vrsta").
export interface QueuedSong {
  id: string;
  title: string;
  author: string;
  added_at: string;
}

// En zagon skilla dodaj-iz-cakalne-vrste (tabela import_batches) s
// strukturiranim poročilom. Skill ob koncu zapiše `report` v tej obliki;
// vsa polja so neobvezna, da se starejša/nepopolna poročila ne sesujejo.
export interface ImportReportAdded {
  song_id?: string;
  title: string;
  author: string;
  genre?: string;
  era?: string;
  origin?: string;
  mood?: string;
  // Kratka utemeljitev razpoloženja (tema besedila).
  mood_reason?: string;
  // Katere povezave so bile najdene ob uvozu.
  links?: {
    ug?: boolean;
    pdf?: boolean;
    zabrenkaj?: boolean;
    other?: boolean;
    youtube?: boolean;
    youtube_music?: boolean;
    spotify?: boolean;
  };
  // Posebnosti te skladbe (npr. ne-originalna različica, ročna izbira).
  note?: string;
}

export interface ImportReport {
  added?: ImportReportAdded[];
  skipped?: { title: string; author: string; reason: string }[];
  remaining?: { title: string; author: string }[];
  author_images?: string[];
  notes?: string[];
}

export interface ImportBatch {
  id: string;
  created_at: string;
  report: ImportReport;
}

// Prijava napake na skladbi (gumb "Prijavi napako" v meniju kartice) —
// glej tabelo song_reports. Prikazano in upravljano v SettingsMenu.tsx
// ("Popravi skladbe").
export interface SongReport {
  id: string;
  song_id: string;
  title: string;
  author: string;
  note: string | null;
  reported_at: string;
}

// Skladba dodana na seznam "Mojih 20 skladb" (cilj učenja), ki je (še) ni v
// glavni knjižnici — enak vzorec kot JamExtra, glej tabelo goal_extras.
export interface GoalExtra {
  id: string;
  title: string;
  author: string;
  added_at: string;
  learned: boolean;
}
