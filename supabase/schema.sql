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

-- Slika kartice po avtorju (glej supabase/migrations/0007_add_author_images.sql):
-- ena slika na avtorja, prikazana pri vseh njegovih skladbah.
create table if not exists public.author_images (
  author text primary key,
  image_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.author_images enable row level security;

create policy "Public read author images" on public.author_images
  for select using (true);

create policy "Public insert author images" on public.author_images
  for insert with check (true);

create policy "Public update author images" on public.author_images
  for update using (true);

create policy "Public delete author images" on public.author_images
  for delete using (true);

-- Ročno dodan link do akordov/tabulature po skladbi (glej
-- supabase/migrations/0008_add_chords_url.sql) — prikazan kot gumb
-- "Akordi" na kartici, kadar je nastavljen.
alter table public.songs
  add column if not exists chords_url text;

-- Izvorna povezava (npr. Ultimate Guitar), iz katere je bil naložen zgornji
-- chords_url PDF (glej supabase/migrations/0010_add_chords_source_url.sql) —
-- prikazana kot ločen gumb "UG Tabs" poleg "PDF akordi".
alter table public.songs
  add column if not exists chords_source_url text;

-- "Jam" čakalna vrsta (glej supabase/migrations/0011_add_jam_queue.sql) —
-- jam_added_at hkrati označuje, da je skladba trenutno v jamu, in določa
-- vrstni red v čakalni vrsti; jam_played je kljukica "odigrano".
alter table public.songs
  add column if not exists jam_added_at timestamptz;

alter table public.songs
  add column if not exists jam_played boolean not null default false;

-- Skladbe dodane v Jam, ki jih (še) ni v glavni knjižnici (glej
-- supabase/migrations/0012_add_jam_extras.sql) — gumb "Skladbe ni".
create table if not exists public.jam_extras (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  added_at timestamptz not null default now(),
  played boolean not null default false
);

alter table public.jam_extras enable row level security;

create policy "Public read jam extras" on public.jam_extras
  for select using (true);

create policy "Public insert jam extras" on public.jam_extras
  for insert with check (true);

create policy "Public update jam extras" on public.jam_extras
  for update using (true);

create policy "Public delete jam extras" on public.jam_extras
  for delete using (true);

-- Omogoči Realtime (postgres_changes) za `songs` in `jam_extras`, da se
-- spremembe Jam čakalne vrste takoj pokažejo vsem odprtim odjemalcem brez
-- osvežitve strani (glej supabase/migrations/0013_enable_realtime.sql).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jam_extras'
  ) then
    alter publication supabase_realtime add table public.jam_extras;
  end if;
end $$;

-- "Skladbe v čakalni vrsti": hitre predloge skladb (samo naslov + avtor),
-- ki jih kdorkoli doda prek gumba "Hitro" ob kliku na "Dodaj skladbo" — glej
-- supabase/migrations/0014_add_queued_songs.sql. Administrator jih kasneje
-- ročno obdela in izbriše, upravljano v SettingsMenu.tsx ("Čakalna vrsta").
create table if not exists public.queued_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  added_at timestamptz not null default now()
);

alter table public.queued_songs enable row level security;

create policy "Public read queued songs" on public.queued_songs
  for select using (true);

create policy "Public insert queued songs" on public.queued_songs
  for insert with check (true);

create policy "Public delete queued songs" on public.queued_songs
  for delete using (true);

-- "Mojih 20 skladb": osebni seznam skladb za naučit do konca leta — enak
-- vzorec kot Jam, samo ločen od njega (glej
-- supabase/migrations/0015_add_goal_list.sql).
alter table public.songs
  add column if not exists goal_added_at timestamptz;

alter table public.songs
  add column if not exists goal_learned boolean not null default false;

create table if not exists public.goal_extras (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  added_at timestamptz not null default now(),
  learned boolean not null default false
);

alter table public.goal_extras enable row level security;

create policy "Public read goal extras" on public.goal_extras
  for select using (true);

create policy "Public insert goal extras" on public.goal_extras
  for insert with check (true);

create policy "Public update goal extras" on public.goal_extras
  for update using (true);

create policy "Public delete goal extras" on public.goal_extras
  for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goal_extras'
  ) then
    alter publication supabase_realtime add table public.goal_extras;
  end if;
end $$;

-- Storage bucket za PDF akorde (glej supabase/migrations/0009_add_song_chords_bucket.sql).
insert into storage.buckets (id, name, public)
values ('song-chords', 'song-chords', true)
on conflict (id) do nothing;

create policy "Public read song chords" on storage.objects
  for select using (bucket_id = 'song-chords');

create policy "Public insert song chords" on storage.objects
  for insert with check (bucket_id = 'song-chords');

create policy "Public update song chords" on storage.objects
  for update using (bucket_id = 'song-chords');

create policy "Public delete song chords" on storage.objects
  for delete using (bucket_id = 'song-chords');

-- "Popravi skladbe": prijave napak na skladbah (gumb "Prijavi napako" v
-- meniju kartice), glej supabase/migrations/0018_add_song_reports.sql.
create table if not exists public.song_reports (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  title text not null,
  author text not null,
  note text,
  reported_at timestamptz not null default now()
);

alter table public.song_reports enable row level security;

create policy "Public read song reports" on public.song_reports
  for select using (true);

create policy "Public insert song reports" on public.song_reports
  for insert with check (true);

create policy "Public delete song reports" on public.song_reports
  for delete using (true);

create policy "Public update song reports" on public.song_reports
  for update using (true) with check (true);

-- Shranjeni povezavi za poslušanje (glej
-- supabase/migrations/0020_add_spotify_youtube_music_urls.sql).
alter table public.songs
  add column if not exists spotify_url text;

alter table public.songs
  add column if not exists youtube_music_url text;

-- Uvozi iz čakalne vrste (batchi s poročilom), glej
-- supabase/migrations/0021_add_import_batches.sql.
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report jsonb not null default '{}'::jsonb
);

alter table public.songs
  add column if not exists import_batch_id uuid
  references public.import_batches (id) on delete set null;

alter table public.import_batches enable row level security;

create policy "Public read import batches" on public.import_batches
  for select using (true);

create policy "Public insert import batches" on public.import_batches
  for insert with check (true);

create policy "Public update import batches" on public.import_batches
  for update using (true) with check (true);

-- Akordi z drugih strani (npr. pesmarica.rs), glej
-- supabase/migrations/0022_add_other_chords_url.sql.
alter table public.songs
  add column if not exists other_chords_url text;

-- Kdaj je bila skladba označena kot priljubljena, glej
-- supabase/migrations/0023_add_favorited_at.sql.
alter table public.songs
  add column if not exists favorited_at timestamptz;
