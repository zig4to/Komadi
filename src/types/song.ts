import type { Era, Genre } from "@/lib/constants";

export interface Song {
  id: string;
  title: string;
  author: string;
  genre: Genre;
  era: Era;
  favorite: boolean;
  created_at: string;
}

export type NewSong = Omit<Song, "id" | "created_at">;
