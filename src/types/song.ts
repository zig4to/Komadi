import type { Difficulty, Era, Genre, Status } from "@/lib/constants";

export interface Song {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  era: Era;
  song_key: string | null;
  capo: number | null;
  difficulty: Difficulty | null;
  status: Status;
  link: string | null;
  favorite: boolean;
  notes: string | null;
  created_at: string;
}

export type NewSong = Omit<Song, "id" | "created_at">;
