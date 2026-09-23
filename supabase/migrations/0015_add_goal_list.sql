-- "Mojih 20 skladb": osebni seznam skladb, ki se jih uporabnik namerava
-- naučiti do konca leta — enak vzorec kot Jam (glej 0011/0012), samo ločen
-- od njega. goal_added_at hkrati označuje "je na seznamu" in vrstni red,
-- goal_learned je kljukica "znam jo". goal_extras pokriva skladbe, ki jih
-- (še) ni v glavni knjižnici (gumb "Skladbe ni" na tem seznamu).
alter table public.songs
  add column if not exists goal_added_at timestamptz;

alter table public.songs
  add column if not exists goal_learned boolean not null default false;

create table if not exists public.goal_extras (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  added_at timestamptz not null default now(),
  learned boolean not null default false
);

alter table public.goal_extras enable row level security;

create policy "Public read goal extras" on public.goal_extras
  for select using (true);

create policy "Public insert goal extras" on public.goal_extras
  for insert with check (true);

create policy "Public update goal extras" on public.goal_extras
  for update using (true);

create policy "Public delete goal extras" on public.goal_extras
  for delete using (true);

-- `songs` je že v supabase_realtime publikaciji (glej 0013), zato
-- goal_added_at/goal_learned spremembe že sinhronizirajo v živo — treba je
-- dodati še novo tabelo goal_extras.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goal_extras'
  ) then
    alter publication supabase_realtime add table public.goal_extras;
  end if;
end $$;
