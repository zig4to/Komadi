-- Akordi z drugih strani: za skladbe, ki nimajo akordov na Ultimate Guitar
-- ali zabrenkaj.si (npr. pesmarica.rs). Shrani se samo povezava; gumb v meniju
-- "Akordi" (ChordsButtons.tsx) dobi ime iz domene povezave.
alter table public.songs
  add column if not exists other_chords_url text;
