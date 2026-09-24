-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) polje "zabrenkaj_url" na skladbo — povezava do
-- akordov na zabrenkaj.si. Ko je nastavljena, meni "Akordi" (ChordsButtons.tsx)
-- pod "PDF akordi" prikaže še tretjo možnost "Zabrenkaj".

alter table public.songs
  add column if not exists zabrenkaj_url text;
