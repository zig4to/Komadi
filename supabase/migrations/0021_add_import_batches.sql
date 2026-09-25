-- Uvozi iz čakalne vrste: vsak zagon skilla dodaj-iz-cakalne-vrste je en
-- "batch" (paket). Batch hrani strukturirano poročilo (report, JSON — obliko
-- opisuje ImportReport v src/types/song.ts), skladbe pa kažejo nanj prek
-- songs.import_batch_id. Prikazano na strani "Čakalna vrsta" v zavihkih
-- "Poročila" in "Zgodovina dodajanja".
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
