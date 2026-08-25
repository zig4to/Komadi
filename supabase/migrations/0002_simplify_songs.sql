-- Poženi to v Supabase Dashboard -> SQL Editor, če je tabela `songs` že
-- ustvarjena po prvotni (obsežnejši) shemi. Odstrani stolpce, ki jih
-- aplikacija ne uporablja več (tonaliteta, kapo, težavnost, status
-- učenja, povezava, opombe) — obdrži samo naslov, avtorja, žanr,
-- obdobje in priljubljeno.
--
-- POZOR: to nepovratno izbriše podatke v teh stolpcih (če si jih
-- kje že izpolnil).

drop index if exists songs_status_idx;

alter table public.songs
  drop column if exists song_key,
  drop column if exists capo,
  drop column if exists difficulty,
  drop column if exists status,
  drop column if exists link,
  drop column if exists notes;
