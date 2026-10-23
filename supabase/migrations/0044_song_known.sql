-- "Znam" (2026-10-23): osebni seznam skladb, ki jih uporabnik zna — gumb "Znam"
-- v meniju kartice, stran "Znam" na domači strani. Pozneje bo aplikacija
-- občasno predlagala naključno skladbo s tega seznama za ponovitev.

create table if not exists public.song_known (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  known_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
alter table public.song_known enable row level security;
create policy "select own known" on public.song_known for select to authenticated using (user_id = auth.uid());
create policy "insert own known" on public.song_known for insert to authenticated with check (user_id = auth.uid());
create policy "update own known" on public.song_known for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own known" on public.song_known for delete to authenticated using (user_id = auth.uid());

alter publication supabase_realtime add table public.song_known;
