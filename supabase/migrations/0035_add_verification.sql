-- Preverjene skladbe: "Akordi preverjeni" (Akordi v aplikaciji ročno
-- pregledani) in "Predvajalnik preverjen" (Smart play / Sam špili usklajen).
-- Ob potrditvi predvajalnika se časi vrstic zamrznejo v synced_lines (frozen,
-- z end in key vsake točke), posnetek pa v preferred_video_id — skladba potem
-- ne rabi več LRCLIB in ni odvisna od kasnejših sprememb logike povezovanja.
alter table public.songs
  add column if not exists verified_chords_at timestamptz,
  add column if not exists verified_player_at timestamptz;
