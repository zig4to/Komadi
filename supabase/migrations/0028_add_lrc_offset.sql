-- "Smart play" v pregledovalniku akordov (ChordsViewer.tsx): zamik besedila s
-- časi (LRCLIB) glede na YouTube video, v sekundah (+ = besedilo pozneje).
-- Za vsak posnetek posebej ({ "<YouTube video ID>": sekunde }), ker ima lahko
-- drug video iste skladbe drugačen uvod. V bazi, da velja na vseh napravah.
alter table public.songs
  add column if not exists lrc_offsets jsonb not null default '{}'::jsonb;
