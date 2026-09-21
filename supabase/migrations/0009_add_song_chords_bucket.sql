-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Storage bucket za PDF akorde/tabulature, ki jih uporabnik naloži pri
-- urejanju skladbe (SongForm "Akordi (PDF)"). URL naloženega PDF-ja se
-- shrani v songs.chords_url (glej 0008_add_chords_url.sql) — če se ta
-- konča na .pdf, kartica namesto zunanje povezave odpre PDF v celozaslonskem
-- pregledovalniku znotraj aplikacije. Enak "brez prijave" varnostni model
-- kot bucket "song-images".
insert into storage.buckets (id, name, public)
values ('song-chords', 'song-chords', true)
on conflict (id) do nothing;

drop policy if exists "Public read song chords" on storage.objects;
create policy "Public read song chords" on storage.objects
  for select using (bucket_id = 'song-chords');

drop policy if exists "Public insert song chords" on storage.objects;
create policy "Public insert song chords" on storage.objects
  for insert with check (bucket_id = 'song-chords');

drop policy if exists "Public update song chords" on storage.objects;
create policy "Public update song chords" on storage.objects
  for update using (bucket_id = 'song-chords');

drop policy if exists "Public delete song chords" on storage.objects;
create policy "Public delete song chords" on storage.objects
  for delete using (bucket_id = 'song-chords');
