-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) polje "chords_source_url" na skladbo — izvorna
-- povezava (npr. Ultimate Guitar), iz katere je bil naložen "chords_url" PDF.
-- Kartica lahko tako prikaže oba gumba hkrati: "PDF akordi" (odpre chords_url
-- PDF v vgrajenem pregledovalniku) in "UG Tabs" (odpre chords_source_url v
-- novem zavihku) — glej 0008_add_chords_url.sql za chords_url.

alter table public.songs
  add column if not exists chords_source_url text;
