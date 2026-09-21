-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) besedilno polje "izvor" — ni fiksen nabor
-- vrednosti (čeprav ima privzete predloge v src/lib/constants.ts), uporabnik
-- lahko doda poljuben nov izvor neposredno v obrazcu, enako kot razpoloženje.

alter table public.songs
  add column if not exists origin text;

create index if not exists songs_origin_idx on public.songs (origin);
