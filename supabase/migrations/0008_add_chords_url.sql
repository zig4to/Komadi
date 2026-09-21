-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) polje "chords_url" na skladbo — ročno dodan
-- link do akordov/tabulature (npr. Ultimate Guitar), prikazan kot gumb
-- "Akordi" na kartici skladbe, kadar je nastavljen.

alter table public.songs
  add column if not exists chords_url text;
