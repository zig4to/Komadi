-- Poženi to v Supabase Dashboard -> SQL Editor (nov, prazen projekt).
-- Če že imaš tabelo iz prejšnje (obsežnejše) sheme, namesto tega poženi
-- supabase/migrations/0002_simplify_songs.sql, da jo poenostaviš na to obliko.

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  genre text not null,
  era text not null,
  favorite boolean not null default false,
  mood text,
  origin text,
  image_url text,
  copy_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists songs_genre_idx on public.songs (genre);
create index if not exists songs_era_idx on public.songs (era);
create index if not exists songs_favorite_idx on public.songs (favorite);
create index if not exists songs_mood_idx on public.songs (mood);
create index if not exists songs_origin_idx on public.songs (origin);
create index if not exists songs_copy_count_idx on public.songs (copy_count desc);

-- Row Level Security: aplikacija nima prijave (osebni projekt), zato
-- z anon/publishable ključem dovolimo vse operacije. Če bo aplikacija
-- javno dostopna, razmisli o Supabase Auth ali vsaj o zaščiti z geslom
-- na nivoju gostovanja, sicer lahko kdorkoli s povezavo do aplikacije
-- dodaja/briše skladbe.
alter table public.songs enable row level security;

create policy "Public read" on public.songs
  for select using (true);

create policy "Public insert" on public.songs
  for insert with check (true);

create policy "Public update" on public.songs
  for update using (true);

create policy "Public delete" on public.songs
  for delete using (true);

-- Storage bucket za slike skladb (glej supabase/migrations/0006_add_song_image.sql
-- za razlago). Enak "brez prijave" varnostni model kot tabela songs.
insert into storage.buckets (id, name, public)
values ('song-images', 'song-images', true)
on conflict (id) do nothing;

create policy "Public read song images" on storage.objects
  for select using (bucket_id = 'song-images');

create policy "Public insert song images" on storage.objects
  for insert with check (bucket_id = 'song-images');

create policy "Public update song images" on storage.objects
  for update using (bucket_id = 'song-images');

create policy "Public delete song images" on storage.objects
  for delete using (bucket_id = 'song-images');
