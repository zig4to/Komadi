-- "Jam" čakalna vrsta: skladbe, ki jih ekipa doda med jam sessionom in
-- obkljuka, ko so odigrane. Ker gre vedno za en, trenutno aktiven "jam" (ne
-- zgodovino več sej), zadošča par stolpcev neposredno na songs namesto
-- ločene tabele — dodajanje nastavi jam_added_at (tudi vrstni red v vrsti),
-- odstranitev iz jama pa oboje spet postavi na null/false.
alter table public.songs
  add column if not exists jam_added_at timestamptz;

alter table public.songs
  add column if not exists jam_played boolean not null default false;
