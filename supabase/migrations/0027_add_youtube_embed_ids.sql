-- Mini predvajalnik v pregledovalniku akordov (YouTubeMiniPlayer.tsx):
-- rezervni YouTube videi iste skladbe (ID-ji iz iskanja), ki jih predvajalnik
-- preizkuša po vrsti, kadar youtube_url ne dovoli vgradnje (napaka 101/150 —
-- založbe pogosto blokirajo tudi lyric videe oboževalcev). Polni
-- scripts/fill-youtube-embed-ids.mjs.
alter table public.songs
  add column if not exists youtube_embed_ids text[];
