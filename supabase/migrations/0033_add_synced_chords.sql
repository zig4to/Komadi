-- Ročno posneti časi posameznih akordov za Smart play (pregledovalnik akordov
-- → "Posnemi čase" → klik na akord med predvajanjem). Ob tem času se med
-- predvajanjem obarva prav ta akord — tudi v introu, solu …
-- Oblika: { "videoId": "<YouTube id>",
--           "sections": [{ "id", "name": "Intro", "offset": <s>, "end": <s | null>,
--                          "points": [{ "t": s, "line": <vrstica v telesu>, "chord": <indeks akorda v vrstici> }] }] }
-- Vsak instrumentalni del ima svoj zamik; "end" = Konec (brez njega 4 s po
-- zadnjem akordu). Ločeno od synced_lines (vrstice).
alter table public.songs
  add column if not exists synced_chords jsonb;
