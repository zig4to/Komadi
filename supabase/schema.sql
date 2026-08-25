-- Poženi to v Supabase Dashboard -> SQL Editor (nov projekt).

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  genre text not null,
  era text not null,
  song_key text,
  capo smallint check (capo is null or (capo >= 0 and capo <= 11)),
  difficulty text,
  status text not null default 'Za naučiti',
  link text,
  favorite boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists songs_genre_idx on public.songs (genre);
create index if not exists songs_era_idx on public.songs (era);
create index if not exists songs_status_idx on public.songs (status);
create index if not exists songs_favorite_idx on public.songs (favorite);

-- Row Level Security: aplikacija nima prijave (osebni projekt), zato
-- z anon ključem dovolimo vse operacije. Če bo aplikacija javno dostopna,
-- razmisli o Supabase Auth ali vsaj o zaščiti z geslom na nivoju gostovanja
-- (npr. Vercel Password Protection), sicer lahko kdorkoli s povezavo do
-- aplikacije dodaja/briše skladbe.
alter table public.songs enable row level security;

create policy "Public read" on public.songs
  for select using (true);

create policy "Public insert" on public.songs
  for insert with check (true);

create policy "Public update" on public.songs
  for update using (true);

create policy "Public delete" on public.songs
  for delete using (true);
