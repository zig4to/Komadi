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
  copy_count: number;
  jam_added_at: string | null;
  jam_played: boolean;
  created_at: string;
}

export type NewSong = Omit<Song, "id" | "created_at" | "copy_count" | "jam_added_at" | "jam_played">;

export interface SimilarSong {
  title: string;
  author: string;
}

// Skladba dodana v Jam, ki je (še) ni v glavni knjižnici — glej gumb
// "Skladbe ni" in tabelo jam_extras v Dashboard.tsx.
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
