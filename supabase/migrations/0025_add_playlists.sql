-- "Playliste": poimenovani seznami skladb iz knjižnice (celostranski pogled,
-- gumb "Playliste" desno od "Jam"). playlist_songs je vezna tabela; izbris
-- playliste ali skladbe počisti njene vnose (on delete cascade).
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_songs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (playlist_id, song_id)
);

alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;

create policy "Public read playlists" on public.playlists for select using (true);
create policy "Public insert playlists" on public.playlists for insert with check (true);
create policy "Public update playlists" on public.playlists for update using (true);
create policy "Public delete playlists" on public.playlists for delete using (true);

create policy "Public read playlist songs" on public.playlist_songs for select using (true);
create policy "Public insert playlist songs" on public.playlist_songs for insert with check (true);
create policy "Public update playlist songs" on public.playlist_songs for update using (true);
create policy "Public delete playlist songs" on public.playlist_songs for delete using (true);
