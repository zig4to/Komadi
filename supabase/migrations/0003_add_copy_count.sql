-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda šteje kolikokrat je bila skladba kopirana (klik na kartico), za
-- prikaz "Popularno" (top 5 najbolj kopiranih skladb).

alter table public.songs
  add column if not exists copy_count integer not null default 0;

create index if not exists songs_copy_count_idx on public.songs (copy_count desc);
