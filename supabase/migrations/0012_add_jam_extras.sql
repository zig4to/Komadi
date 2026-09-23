-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Ločena tabela za skladbe, ki jih uporabnik doda v Jam čakalno vrsto, a jih
-- (še) ni v glavni knjižnici (gumb "Skladbe ni" poleg "Dodaj skladbo v Jam").
-- Namerno ločeno od `songs` — gre za začasne vnose samo za Jam, ki naj se ne
-- pojavijo v "Vsi Komadi" ali filtrih po žanru/obdobju.

create table if not exists public.jam_extras (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  added_at timestamptz not null default now(),
  played boolean not null default false
);

alter table public.jam_extras enable row level security;

create policy "Public read jam extras" on public.jam_extras
  for select using (true);

create policy "Public insert jam extras" on public.jam_extras
  for insert with check (true);

create policy "Public update jam extras" on public.jam_extras
  for update using (true);

create policy "Public delete jam extras" on public.jam_extras
  for delete using (true);
