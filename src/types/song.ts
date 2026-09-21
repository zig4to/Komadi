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
  copy_count: number;
  created_at: string;
}

export type NewSong = Omit<Song, "id" | "created_at" | "copy_count">;

export interface SimilarSong {
  title: string;
  author: string;
}
