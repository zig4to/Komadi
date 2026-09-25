-- Shranjeni povezavi za poslušanje: točna Spotify skladba in YouTube Music
-- (albumska različica, "Topic" posnetek). Polni ju skill
-- dodaj-iz-cakalne-vrste (korak 4c); ListenButton.tsx ju uporabi, če
-- obstajata, sicer odpre iskanje "avtor naslov" kot doslej.
alter table public.songs
  add column if not exists spotify_url text;

alter table public.songs
  add column if not exists youtube_music_url text;
