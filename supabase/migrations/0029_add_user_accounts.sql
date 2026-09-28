-- Prijava uporabnikov (skupni Supabase Auth s hubom TomStudios).
--
-- Vsak uporabnik ima svojo knjižnico: vse tabele dobijo user_id in RLS
-- "samo lastne vrstice". Izjema je SELECT na songs, ki je odprt za vse
-- prijavljene — to potrebuje filter "Skupno" (pregled in uvoz skladb drugih).
-- Zato mora aplikacija pri nalaganju svoje knjižnice VEDNO filtrirati
-- .eq("user_id", <moj id>). author_images ostane skupna tabela.
--
-- Obstoječe vrstice posvoji račun ziga.skater@gmail.com — ta mora pred
-- zagonom že obstajati (enkrat se prijavi/registriraj v hubu TomStudios),
-- sicer se migracija prekine in se nič ne spremeni.
--
-- Zaženi ob objavi nove verzije aplikacije: stara verzija (brez prijave)
-- po tej migraciji ne vidi več nobenih podatkov.

do $$
declare
  owner uuid;
  t text;
  pol record;
  tables text[] := array[
    'songs', 'jam_extras', 'goal_extras', 'jam_history', 'queued_songs',
    'song_reports', 'import_batches', 'playlists', 'playlist_songs'
  ];
begin
  select id into owner from auth.users where lower(email) = 'ziga.skater@gmail.com';
  if owner is null then
    raise exception 'Račun ziga.skater@gmail.com ne obstaja — najprej se registriraj v hubu TomStudios.';
  end if;

  foreach t in array tables loop
    execute format(
      'alter table public.%I add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade',
      t);
    execute format('update public.%I set user_id = %L where user_id is null', t, owner);
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);

    -- Pobriši vse stare (javne) politike te tabele.
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    if t = 'songs' then
      execute 'create policy "select all songs" on public.songs for select to authenticated using (true)';
    else
      execute format('create policy "select own rows" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    end if;
    execute format('create policy "insert own rows" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy "update own rows" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "delete own rows" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;

  -- author_images: skupna, a samo za prijavljene.
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'author_images' loop
    execute format('drop policy %I on public.author_images', pol.policyname);
  end loop;
  create policy "authenticated read author images" on public.author_images
    for select to authenticated using (true);
  create policy "authenticated insert author images" on public.author_images
    for insert to authenticated with check (true);
  create policy "authenticated update author images" on public.author_images
    for update to authenticated using (true) with check (true);
  create policy "authenticated delete author images" on public.author_images
    for delete to authenticated using (true);
end $$;

-- Iz katere skladbe (drugega uporabnika) je bila skladba uvožena prek "Skupno".
alter table public.songs
  add column if not exists imported_from uuid references public.songs (id) on delete set null;

-- Storage: branje ostane javno (povezave do PDF-jev/slik so javne), pisanje
-- samo za prijavljene.
drop policy if exists "Public insert song images" on storage.objects;
drop policy if exists "Public update song images" on storage.objects;
drop policy if exists "Public delete song images" on storage.objects;
drop policy if exists "Public insert song chords" on storage.objects;
drop policy if exists "Public update song chords" on storage.objects;
drop policy if exists "Public delete song chords" on storage.objects;

create policy "Authenticated insert song files" on storage.objects
  for insert to authenticated with check (bucket_id in ('song-images', 'song-chords'));
create policy "Authenticated update song files" on storage.objects
  for update to authenticated using (bucket_id in ('song-images', 'song-chords'));
create policy "Authenticated delete song files" on storage.objects
  for delete to authenticated using (bucket_id in ('song-images', 'song-chords'));
