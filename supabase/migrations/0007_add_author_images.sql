-- Poženi to v Supabase Dashboard -> SQL Editor (ali `supabase db push`).
-- Slika kartice se odslej veže na AVTORJA, ne na posamezno skladbo: ena
-- slika na avtorja, ki se prikaže pri vseh njegovih skladbah. To nadomesti
-- prejšnji pristop (songs.image_url, migracija 0006) — ta stolpec ostane v
-- bazi zaradi obstoječih podatkov, a ga aplikacija za prikaz ne bere več.

create table if not exists public.author_images (
  author text primary key,
  image_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.author_images enable row level security;

drop policy if exists "Public read author images" on public.author_images;
create policy "Public read author images" on public.author_images
  for select using (true);

drop policy if exists "Public insert author images" on public.author_images;
create policy "Public insert author images" on public.author_images
  for insert with check (true);

drop policy if exists "Public update author images" on public.author_images;
create policy "Public update author images" on public.author_images
  for update using (true);

drop policy if exists "Public delete author images" on public.author_images;
create policy "Public delete author images" on public.author_images
  for delete using (true);
