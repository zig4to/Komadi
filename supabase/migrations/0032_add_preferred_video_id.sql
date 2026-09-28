-- Posnetek, ki ga je uporabnik izbral v izbirniku mini predvajalnika
-- (pregledovalnik akordov) — predvaja se prvi, na vseh napravah. Ločeno od
-- youtube_url, ki ga uporablja gumb za poslušanje (ListenButton).
alter table public.songs
  add column if not exists preferred_video_id text;
