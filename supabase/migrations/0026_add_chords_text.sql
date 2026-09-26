-- Vgrajen pregledovalnik akordov (ChordsViewer.tsx): surov UG markup
-- ([ch]Am[/ch], [tab]…[/tab], [Verse] …) iz tab strani chords_source_url.
-- Polni ga scripts/fill-chords-text.mjs. Obstoječe povezave/PDF ostanejo.
alter table public.songs
  add column if not exists chords_text text;
