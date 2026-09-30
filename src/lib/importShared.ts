import { supabase } from "@/lib/supabaseClient";
import type { Song } from "@/types/song";

// Ključ za primerjavo skladb med knjižnicami (naslov + avtor, brez
// velikosti črk, šumnikov in ločil) — "Skupno" po njem združi podvojene
// skladbe različnih uporabnikov in označi tiste, ki jih že imam.
export function songMatchKey(song: Pick<Song, "title" | "author">): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(song.title)}|${norm(song.author)}`;
}

// Skladbe drugih uporabnikov za "Skupno": ena na naslov+avtor (izbrana tista
// z največ podatki o akordih), razvrščene po naslovu.
export function dedupeShared(songs: Song[]): Song[] {
  const score = (s: Song) =>
    (s.chords_text ? 4 : 0) +
    (s.chords_source_url ? 1 : 0) +
    (s.zabrenkaj_url ? 1 : 0) +
    (s.chords_url ? 1 : 0) +
    (s.other_chords_url ? 1 : 0);
  const byKey = new Map<string, Song>();
  for (const song of songs) {
    const key = songMatchKey(song);
    const prev = byKey.get(key);
    if (!prev || score(song) > score(prev)) byKey.set(key, song);
  }
  return [...byKey.values()];
}

// Prekopira skladbe drugega uporabnika v mojo knjižnico. Osebni podatki
// (priljubljena, Jam, Mojih 20, popularnost, uvozni batch) se ne prenesejo;
// akordi, povezave, besedilo in zamiki za Smart play ostanejo. user_id
// nastavi baza (default auth.uid()).
export async function importSharedSongs(sources: Song[]): Promise<Song[]> {
  if (!sources.length) return [];
  const rows = sources.map((s) => ({
    title: s.title,
    author: s.author,
    genre: s.genre,
    era: s.era,
    mood: s.mood,
    origin: s.origin,
    image_url: s.image_url,
    chords_url: s.chords_url,
    chords_source_url: s.chords_source_url,
    zabrenkaj_url: s.zabrenkaj_url,
    other_chords_url: s.other_chords_url,
    chords_text: s.chords_text,
    youtube_url: s.youtube_url,
    spotify_url: s.spotify_url,
    youtube_music_url: s.youtube_music_url,
    youtube_embed_ids: s.youtube_embed_ids,
    lrc_offsets: s.lrc_offsets ?? {},
    // Oznaki preverjanja sta vsebina skladbe (zamrznjeni časi in posnetek se
    // kopirajo spodaj). Samo kadar sta nastavljeni — stolpca sta iz 0035.
    ...(s.verified_chords_at ? { verified_chords_at: s.verified_chords_at } : {}),
    ...(s.verified_player_at ? { verified_player_at: s.verified_player_at } : {}),
    synced_lines: s.synced_lines ?? null,
    preferred_video_id: s.preferred_video_id ?? null,
    synced_chords: s.synced_chords ?? null,
    imported_from: s.id,
  }));
  const { data, error } = await supabase.from("songs").insert(rows).select();
  if (error) throw new Error(error.message);
  return data as Song[];
}
