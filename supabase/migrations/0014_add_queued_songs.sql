-- "Skladbe v čakalni vrsti": hitre predloge skladb (samo naslov + avtor),
-- ki jih kdorkoli doda prek gumba "Hitro" ob kliku na "Dodaj skladbo" — brez
-- žanra/obdobja/itd. Administrator jih kasneje ročno obdela (npr. v enem
-- zamahu prek uvoznega prompta) in po obdelavi izbriše iz te tabele.
-- Prikazano/upravljano v SettingsMenu.tsx ("Čakalna vrsta").
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
