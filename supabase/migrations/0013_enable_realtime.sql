-- Omogoči Supabase Realtime (postgres_changes) za `songs` in `jam_extras`,
-- da se dodajanje/odstranjevanje/obkljukanje skladb v Jamu (in spremembe
-- skladb nasploh) takoj pokažejo vsem odprtim odjemalcem brez osvežitve
-- strani (glej realtime naročnino v Dashboard.tsx). `do $$ ... $$` blok
-- naredi ukaz varen za ponovni zagon — `alter publication ... add table`
-- sam po sebi nima "if not exists" različice in bi ob ponovnem zagonu vrgel
-- napako "relation is already member of publication".
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
