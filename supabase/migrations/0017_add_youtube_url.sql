-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) polje "youtube_url" na skladbo — povezava do
-- videa skladbe na YouTubu. Uporabljeno v meniju gumba "Poslušaj"
-- (ListenButton.tsx).

alter table public.songs
  add column if not exists youtube_url text;
