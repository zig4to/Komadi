-- "Popravi skladbe": prijave napak na posamezni skladbi (gumb "Prijavi
-- napako" v meniju kartice, SongCard.tsx). Naslov/avtor se shranita kot
-- posnetek, da je prijava berljiva tudi brez joina na songs; ob izbrisu
-- skladbe se prijava izbriše z njo. Prikazano/upravljano v SettingsMenu.tsx
-- ("Popravi skladbe") — po popravku se prijava izbriše.
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
