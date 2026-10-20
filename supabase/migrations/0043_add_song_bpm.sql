-- Metronom v pregledovalniku akordov: tempo skladbe (udarcev na minuto).
-- Polni scripts/fill-bpm.mjs iz zvočne analize zaklenjenega/prvega videa
-- (scripts/spedenaj/audio.py), za nove skladbe pa skill spedenaj in
-- dodaj-iz-cakalne-vrste. null = še ni izmerjeno (metronom začne pri 100).
alter table public.songs add column if not exists bpm numeric;
