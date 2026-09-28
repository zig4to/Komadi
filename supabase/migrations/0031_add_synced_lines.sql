-- Ročno posneti časi vrstic za "Smart play" (pregledovalnik akordov →
-- ⚙ Napredne nastavitve → "Posnemi čase"), za skladbe, ki jih LRCLIB nima.
-- Oblika: { "videoId": "<YouTube id, ob katerem so bili posneti>",
--           "points": [{ "t": <sekunde>, "line": <indeks vrstice v telesu pesmi> }, ...] }
-- Kadar je nastavljeno, ima prednost pred besedilom iz LRCLIB.
alter table public.songs
  add column if not exists synced_lines jsonb;
