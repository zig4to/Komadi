---
name: podcrtaj-akorde
description: "Natapka akorde v ZAPETIH vrsticah skladbe (kitice, refreni, zapeti interludiji) po času iz zvočne analize posnetka in vklopi podčrtavanje: v aplikaciji Bitne Tabs je akord v vrstici z besedilom ob svojem času podčrtan, v vrsticah brez besedila (intro, solo, outro) pobarvan — tako kot pri Boulevard of Broken Dreams. Sproži se, ko uporabnik reče 'podčrtaj akorde' (npr. 'podčrtaj akorde Dreamer'). Skladba mora imeti zaklenjen video in čase vrstic (najprej skill spedenaj)."
---

## Kontekst (ne raziskuj, samo uporabi)

- Prikaz: `ChordsViewer.tsx` → `chordName()`: če ima `songs.synced_chords.sungUnderline = true`, je natapkan akord v
  vrstici z besedilom ob svojem času samo podčrtan (spodnja črta malo čez ime), v vrstici samih akordov pobarvan.
  Brez zastavice se obnaša kot prej (vse pobarvano). Zastavico nastavi orodje spodaj.
- Časi akordov so deli v `synced_chords.sections` (ime = oznaka v tabu: "Verse 1", "Chorus 2" …), enako kot
  natapkani intro/solo — uporabnik jih v snemanju časov vidi v seznamu delov in vsakemu akordu lahko premakne čas
  (−¼ − + +¼), ga predvaja (▶) ali odstrani (✕).
- **Preverjenih skladb (`verified_player_at`) ne spreminjaj** — orodje jih zavrne (pravilo iz CLAUDE.md). Če
  uporabnik izrecno želi, mora najprej sam umakniti preverjanje.
- Orodji:
  - `"$LOCALAPPDATA/Komadi/spedenaj-venv/Scripts/python" scripts/spedenaj/audio.py <videoId> --out a.json`
    (mreža taktov + kromagram; okolje in 403 → glej skill `spedenaj`).
  - `node --env-file=.env.local scripts/spedenaj/sung-chords.mjs <id> --audio a.json [--write]` — oceni in pripne
    čase, izpiše jih po delih, "šibko ujemanje" in "prekrivanja"; brez `--write` samo izpiše; z `--write` shrani
    prejšnje stanje v `backups/spedenaj/`, zapiše dele in `sungUnderline: true`.
  - `node --env-file=.env.local scripts/spedenaj/song.mjs dump <id> --audio a.json` (stanje, indeksi vrstic j).
- Začasne datoteke (`a.json`) v scratchpad seje.

## Koraki

### 1. Pogoji
`song.mjs dump <id>`: skladba mora imeti `preferred_video_id` (zaklenjen video) in čase vrstic (shranjene ali LRC
"povezanih X/Y" z vsemi zapetimi vrsticami). Če manjka karkoli od tega ali so oznake delov neoštevilčene / intro in
solo nenatapkani, **najprej zaženi skill `spedenaj`** (ta tudi popravi napačne LRC čase — podčrtavanje je tako
točno, kot so točni časi vrstic). `synced_chords.videoId` mora biti isti video.

### 2. Zvok
`audio.py <preferred_video_id> --out a.json`. Preveri mrežo: menjave akordov prve kitice morajo padati na
`downbeat + k·bar/2` (kot pri spedenaj, korak 5.1).

### 3. Ocena (brez pisanja)
`sung-chords.mjs <id> --audio a.json`. Preglej izpis:
- Časi v vsakem delu morajo naraščati in slediti progresiji (pri pravilni pesmi akordi lepo padejo na mrežo —
  Boulevard of Broken Dreams: vsak akord na 1,437 s).
- **Šibko ujemanje** = zvok akorda ne potrdi (podobna akorda, npr. D/A, G/Gsus4, ali hiter okrasek znotraj takta) —
  ostane ocena iz besedila; navedi jih v poročilu, uporabnik jih po potrebi premakne v seznamu akordov.
- **Prekrivanja** = akord petja na istem udarcu kot že natapkan akord drugega dela (npr. Em na "alone" = prvi Em
  interludija): oba ostaneta ob istem času in aplikacija ju obarva hkrati (`chordsAt`), nato gre naprej na
  naslednji akord — tako je uporabnik želel pri Boulevard of Broken Dreams (Interlude 1 in 4). Akorda v tabu ne
  odstranjuj.
- Če je več kot ~tretjina akordov šibkih (rubato, brez stalnega tempa, posnetek v živo), ne zapisuj — povej
  uporabniku, da je za to skladbo bolje tapkati ročno.

### 4. Zapis
`sung-chords.mjs <id> --audio a.json --write`. Nato `song.mjs dump <id>`: akordi zapetih vrstic imajo čase
(`Ime@m:ss`), deli so na pravih vrsticah.

### 5. Poročilo (slovensko, kratko)
- koliko akordov v katerih delih, kateri so negotovi (šibko ujemanje), prekrivanja in predlog za tab;
- kje preveriti: navadni pogled ali Sam Špili med predvajanjem — akord v vrstici z besedilom je podčrtan, v intru /
  solu / outru pobarvan; časi so popravljivi v snemanju časov (seznam akordov pod vsakim delom);
- prejšnje stanje je v `backups/spedenaj/`.
