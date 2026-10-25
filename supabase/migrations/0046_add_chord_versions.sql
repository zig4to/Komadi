-- Več verzij akordov iste skladbe (npr. UG in zabrenkaj.si): seznam
-- [{ label, source?, chords_text?, main? }]; vnos z main = true je
-- songs.chords_text (ni podvojen). Izbira verzije je na napravi.
alter table public.songs add column if not exists chord_versions jsonb;
