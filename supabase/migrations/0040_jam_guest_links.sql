-- Skupni Jam za goste: povezava "?gost=<žeton>" (gumb Deli v Jamu) velja 24 ur.
-- Gost nima prijave — podatke dobi samo prek spodnjih dveh funkcij (security
-- definer, preverita žeton); sledenje vodji in krogci gredo po obstoječih javnih
-- Realtime kanalih (shared-jam-view, shared-jam-presence) z anon ključem.

create extension if not exists pgcrypto;

create table if not exists public.jam_guest_links (
  token text primary key default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.jam_guest_links enable row level security;
create policy "insert own guest link" on public.jam_guest_links for insert to authenticated with check (created_by = auth.uid());
create policy "select own guest link" on public.jam_guest_links for select to authenticated using (created_by = auth.uid());
create policy "delete own guest link" on public.jam_guest_links for delete to authenticated using (created_by = auth.uid());

create or replace function public.guest_link_valid(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.jam_guest_links where token = p_token and expires_at > now());
$$;

-- Skladba za pregledovalnik akordov (samo stolpci, ki jih rabi).
create or replace function public.guest_jam_song(p_token text, p_song_id uuid)
returns setof public.songs
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.songs s
  where s.id = p_song_id and public.guest_link_valid(p_token);
$$;

-- Vrsta Skupnega Jama (samo branje).
create or replace function public.guest_shared_jam(p_token text)
returns table (id uuid, song_id uuid, title text, author text, played boolean, added_at timestamptz, added_by_name text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.song_id, i.title, i.author, i.played, i.added_at, i.added_by_name
  from public.shared_jam_items i
  where public.guest_link_valid(p_token)
  order by i.added_at;
$$;

grant execute on function public.guest_link_valid(text) to anon, authenticated;
grant execute on function public.guest_jam_song(text, uuid) to anon, authenticated;
grant execute on function public.guest_shared_jam(text) to anon, authenticated;
