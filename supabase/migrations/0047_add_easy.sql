-- "Lahka" skladba za skill spedenaj (brez dolgega intra, solov in premorov):
-- na strani "Pregled in odobritev" ima kartica značko E v desnem kotu.
alter table public.songs add column if not exists easy boolean not null default false;
