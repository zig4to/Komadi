-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) besedilno polje "razpoloženje" — ni fiksen
-- nabor vrednosti kot žanr/obdobje, uporabnik lahko doda poljubno novo
-- razpoloženje neposredno v obrazcu.

alter table public.songs
  add column if not exists mood text;

create index if not exists songs_mood_idx on public.songs (mood);
