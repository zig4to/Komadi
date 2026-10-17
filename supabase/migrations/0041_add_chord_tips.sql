-- "Nasvet" v pregledovalniku akordov: ponavljajoča se zaporedja akordov, ki jih
-- najde skill spedenaj (scripts/spedenaj/song.mjs tips, src/lib/chordPatterns.ts)
-- in shrani tukaj ({ whole, parts, sameVerseChorus }, izvirna imena akordov —
-- transpozicijo doda pregledovalnik). null = ni najdenih ponavljanj.
alter table public.songs add column if not exists chord_tips jsonb;
