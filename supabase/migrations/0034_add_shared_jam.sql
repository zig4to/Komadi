-- "Skupni Jam": ena skupna vrsta za celo aplikacijo — vidijo in urejajo jo
-- vsi prijavljeni uporabniki (poleg osebnega Jama na songs.jam_added_at).
-- song_id kaže na skladbo iz knjižnice kateregakoli uporabnika (select na
-- songs je odprt za prijavljene); null = "Skladbe ni" (samo naslov/avtor).
-- added_by_name: ime in priimek ob dodajanju (krogec z začetnicami), ker
-- metapodatki drugih uporabnikov niso berljivi.
create table if not exists public.shared_jam_items (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs (id) on delete set null,
  title text not null,
  author text not null,
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_by_name text,
  added_at timestamptz not null default now(),
  played boolean not null default false
);

create index if not exists shared_jam_items_added_at_idx on public.shared_jam_items (added_at);

alter table public.shared_jam_items enable row level security;

create policy "shared jam read" on public.shared_jam_items
  for select to authenticated using (true);
create policy "shared jam insert" on public.shared_jam_items
  for insert to authenticated with check (added_by = auth.uid());
create policy "shared jam update" on public.shared_jam_items
  for update to authenticated using (true) with check (true);
create policy "shared jam delete" on public.shared_jam_items
  for delete to authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_jam_items'
  ) then
    alter publication supabase_realtime add table public.shared_jam_items;
  end if;
end $$;
