-- Privat Jam ostane oseben tudi ob skupni knjižnici (0038): vrsta skladb iz
-- knjižnice je v svoji tabeli po uporabniku (prej songs.jam_added_at /
-- jam_played na skupni vrstici). "Skladbe ni" (jam_extras) in arhiv
-- (jam_history) sta že osebna.

create table if not exists public.private_jam (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  added_at timestamptz not null default now(),
  played boolean not null default false,
  primary key (user_id, song_id)
);
alter table public.private_jam enable row level security;
create policy "select own jam" on public.private_jam for select to authenticated using (user_id = auth.uid());
create policy "insert own jam" on public.private_jam for insert to authenticated with check (user_id = auth.uid());
create policy "update own jam" on public.private_jam for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own jam" on public.private_jam for delete to authenticated using (user_id = auth.uid());

-- Prenos trenutnega Jama (samo admin ga je imel): lastnik vrstice = njegov Jam.
insert into public.private_jam (user_id, song_id, added_at, played)
select s.user_id, s.id, s.jam_added_at, coalesce(s.jam_played, false)
from public.songs s
where s.jam_added_at is not null
on conflict do nothing;

alter publication supabase_realtime add table public.private_jam;
