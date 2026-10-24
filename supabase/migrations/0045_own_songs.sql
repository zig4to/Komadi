-- "Pišem" (2026-10-24): lastne skladbe benda — vodič in urejevalnik (gumb na
-- domači strani desno od "Znam"). Skupne: vsi prijavljeni berejo in urejajo vse
-- (uporabnikova odločitev). Ko je skladba gotova, jo "Prestavi v knjižnico"
-- vstavi v songs (review_pending) in si zapomni library_song_id.

create table if not exists public.own_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  idea text not null default '',
  mood text,
  key_tonic smallint not null default 0,
  key_minor boolean not null default false,
  bpm smallint not null default 100,
  sections jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_by_name text,
  updated_by_name text,
  library_song_id uuid references public.songs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.own_songs enable row level security;
create policy "select own_songs" on public.own_songs for select to authenticated using (true);
create policy "insert own_songs" on public.own_songs for insert to authenticated with check (created_by = auth.uid());
create policy "update own_songs" on public.own_songs for update to authenticated using (true) with check (true);
create policy "delete own_songs" on public.own_songs for delete to authenticated using (true);

-- Glasovni zapisi (melodija, kitara) k skladbi; datoteke v bucketu song-memos.
create table if not exists public.own_song_memos (
  id uuid primary key default gen_random_uuid(),
  own_song_id uuid not null references public.own_songs (id) on delete cascade,
  path text not null,
  duration real,
  label text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.own_song_memos enable row level security;
create policy "select memos" on public.own_song_memos for select to authenticated using (true);
create policy "insert memos" on public.own_song_memos for insert to authenticated with check (created_by = auth.uid());
create policy "update memos" on public.own_song_memos for update to authenticated using (true) with check (true);
create policy "delete memos" on public.own_song_memos for delete to authenticated using (true);

alter publication supabase_realtime add table public.own_songs;
alter publication supabase_realtime add table public.own_song_memos;

-- Zaseben bucket: samo prijavljeni, predvajanje prek podpisanih povezav.
insert into storage.buckets (id, name, public) values ('song-memos', 'song-memos', false)
on conflict (id) do nothing;
create policy "memos read" on storage.objects for select to authenticated using (bucket_id = 'song-memos');
create policy "memos insert" on storage.objects for insert to authenticated with check (bucket_id = 'song-memos');
create policy "memos delete" on storage.objects for delete to authenticated using (bucket_id = 'song-memos');
