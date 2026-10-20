-- "Ali si vedel?" v pregledovalniku akordov: o čem govori pesem, zakaj in kdaj
-- jo je avtor napisal, ter 5 zanimivosti. Piše skill spedenaj
-- (scripts/spedenaj/song.mjs story), aplikacija samo bere.
-- { about: string (odstavki ločeni z \n\n), facts: string[], sources?: string[] }
alter table public.songs add column if not exists song_story jsonb;
