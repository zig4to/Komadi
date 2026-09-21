-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Doda neobvezno (nullable) polje "image_url" na skladbo ter Storage bucket
-- "song-images", kamor se nalagajo (stisnjene) slike ozadja kartice.

alter table public.songs
  add column if not exists image_url text;

-- Storage bucket za slike skladb. Enak "brez prijave" varnostni model kot
-- tabela songs (osebni projekt, javno branje/pisanje z anon ključem).
insert into storage.buckets (id, name, public)
values ('song-images', 'song-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read song images" on storage.objects;
create policy "Public read song images" on storage.objects
  for select using (bucket_id = 'song-images');

drop policy if exists "Public insert song images" on storage.objects;
create policy "Public insert song images" on storage.objects
  for insert with check (bucket_id = 'song-images');

drop policy if exists "Public update song images" on storage.objects;
create policy "Public update song images" on storage.objects
  for update using (bucket_id = 'song-images');

drop policy if exists "Public delete song images" on storage.objects;
create policy "Public delete song images" on storage.objects
  for delete using (bucket_id = 'song-images');
