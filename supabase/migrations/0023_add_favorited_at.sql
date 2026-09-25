-- Kdaj je bila skladba označena kot priljubljena. Na domači strani se
-- prikažejo priljubljene tekočega meseca ("Priljubljeno ta mesec"), starejše
-- pa po mesecih na strani "Arhiv priljubljenih" (FavoritesMonth.tsx). Ob
-- odstranitvi iz priljubljenih se vrednost pobriše (null).
alter table public.songs
  add column if not exists favorited_at timestamptz;
