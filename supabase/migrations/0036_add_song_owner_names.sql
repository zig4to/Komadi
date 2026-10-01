-- "Priljubljeno <mesec>" → "Drugi": priljubljene drugih uporabnikov po osebah.
-- Imena so v auth.users.raw_user_meta_data (first_name/last_name), ki ga
-- brskalnik ne more brati — ta funkcija vrne samo id + ime lastnikov skladb
-- (brez e-pošte), samo prijavljenim.
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
  where exists (select 1 from public.songs s where s.user_id = u.id);
$$;

revoke all on function public.song_owner_names() from public, anon;
grant execute on function public.song_owner_names() to authenticated;
