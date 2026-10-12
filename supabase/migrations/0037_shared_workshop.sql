-- Skupna "Delavnica" (2026-10-12, odločitev uporabnika): Čakalna vrsta,
-- Pregled in odobritev in Popravi skladbe so za vse prijavljene uporabnike
-- enake kot pri adminu (ziga.skater) in vsi smejo vse kot admin.
--
-- queued_songs, song_reports: vsi berejo, spreminjajo in brišejo vse vrstice;
--   dodajajo z lastnim user_id (privzeto auth.uid()).
-- import_batches: vsi berejo (zavihka Poročila / Zgodovina dodajanja);
--   piše jih skill dodaj-iz-cakalne-vrste s service role.
-- songs: poleg lastnih vrstic smejo vsi urejati skladbe, ki čakajo na
--   pregled (review_pending) ali imajo odprto prijavo napake, in brisati
--   skladbe v pregledu.

-- queued_songs
drop policy if exists "select own rows" on public.queued_songs;
drop policy if exists "update own rows" on public.queued_songs;
drop policy if exists "delete own rows" on public.queued_songs;
create policy "select all rows" on public.queued_songs for select to authenticated using (true);
create policy "update all rows" on public.queued_songs for update to authenticated using (true) with check (true);
create policy "delete all rows" on public.queued_songs for delete to authenticated using (true);

-- song_reports
drop policy if exists "select own rows" on public.song_reports;
drop policy if exists "update own rows" on public.song_reports;
drop policy if exists "delete own rows" on public.song_reports;
create policy "select all rows" on public.song_reports for select to authenticated using (true);
create policy "update all rows" on public.song_reports for update to authenticated using (true) with check (true);
create policy "delete all rows" on public.song_reports for delete to authenticated using (true);

-- import_batches
drop policy if exists "select own rows" on public.import_batches;
create policy "select all rows" on public.import_batches for select to authenticated using (true);

-- songs: delavnica
create policy "update workshop songs" on public.songs for update to authenticated
  using (
    review_pending
    or exists (select 1 from public.song_reports r where r.song_id = songs.id)
  )
  with check (true);
create policy "delete review songs" on public.songs for delete to authenticated
  using (review_pending);

-- Lastnika skladbe ne sme spremeniti nihče (with check (true) zgoraj bi sicer
-- dovolil prepis user_id pri tuji skladbi v delavnici).
create or replace function public.songs_keep_owner() returns trigger
language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id skladbe se ne sme spremeniti';
  end if;
  return new;
end;
$$;
drop trigger if exists songs_keep_owner on public.songs;
create trigger songs_keep_owner before update on public.songs
  for each row execute function public.songs_keep_owner();
