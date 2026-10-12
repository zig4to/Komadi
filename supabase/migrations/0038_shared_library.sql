-- Ena skupna knjižnica (2026-10-12, odločitev uporabnika): vse skladbe so
-- skladbe admina (ziga.skater, a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9); vsi
-- prijavljeni jih vidijo in urejajo, nove skladbe gredo vedno vanjo. Osebno ima
-- vsak samo priljubljene (nova tabela song_favorites) in playliste.
-- Kopije drugih uporabnikov (uvožene prej) ostanejo v bazi, a jih aplikacija ne kaže.

create table if not exists public.song_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  favorited_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
alter table public.song_favorites enable row level security;
-- Vsi berejo (vrstica "Priljubljeno" → "Drugi"), vsak piše samo svoje.
create policy "select all favorites" on public.song_favorites for select to authenticated using (true);
create policy "insert own favorites" on public.song_favorites for insert to authenticated with check (user_id = auth.uid());
create policy "update own favorites" on public.song_favorites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own favorites" on public.song_favorites for delete to authenticated using (user_id = auth.uid());

-- Prenos obstoječih priljubljenih: admin na svojih skladbah, ostali s svojih
-- kopij na izvirnik v skupni knjižnici (imported_from).
insert into public.song_favorites (user_id, song_id, favorited_at)
select s.user_id, s.id, coalesce(s.favorited_at, s.created_at)
from public.songs s
where s.favorite and s.user_id = 'a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9'
on conflict do nothing;
insert into public.song_favorites (user_id, song_id, favorited_at)
select s.user_id, a.id, coalesce(s.favorited_at, s.created_at)
from public.songs s
join public.songs a on a.id = s.imported_from and a.user_id = 'a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9'
where s.favorite and s.user_id <> 'a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9'
on conflict do nothing;

-- Skupna knjižnica: vsi urejajo skladbe admina in dodajajo nove vanjo.
create policy "update library songs" on public.songs for update to authenticated
  using (user_id = 'a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9') with check (true);
create policy "insert library songs" on public.songs for insert to authenticated
  with check (user_id = 'a14ed5f4-8ae8-497e-a4fc-0ad6c82f38c9');

-- Imena za "Priljubljeno" → "Drugi": tudi uporabniki, ki imajo samo priljubljene.
create or replace function public.song_owner_names()
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         nullif(trim(coalesce(u.raw_user_meta_data->>'first_name', '') || ' ' ||
                     coalesce(u.raw_user_meta_data->>'last_name', '')), '')
  from auth.users u
  where exists (select 1 from public.songs s where s.user_id = u.id)
     or exists (select 1 from public.song_favorites f where f.user_id = u.id);
$$;

alter publication supabase_realtime add table public.song_favorites;
