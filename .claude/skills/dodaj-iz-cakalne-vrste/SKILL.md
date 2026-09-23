---
name: dodaj-iz-cakalne-vrste
description: "Obdelaj skladbe iz čakalne vrste (Supabase tabela queued_songs) v aplikaciji Bitne Tabs: za izbrane skladbe poišče UG chords povezavo, doda žanr/obdobje/izvor, generira PDF akorde in doda sliko avtorja, nato jih izbriše iz čakalne vrste. Sproži se, ko uporabnik reče nekaj v stilu 'dodaj/obdelaj/uvozi/vnesi skladbe iz čakalne vrste'. Uporabnik izbere, katere skladbe s seznama naj se obdelajo zdaj (če jih je več kot ena)."
---

## Kontekst repozitorija (ne raziskuj, samo uporabi)

- Next.js static-export app "Bitne Tabs", edini backend je Supabase (tabele
  `songs`, `author_images`, `queued_songs`, ...), brez avtentikacije, RLS
  dovoljuje javno branje/pisanje z anon ključem.
- `.env.local` v korenu repozitorija vsebuje `NEXT_PUBLIC_SUPABASE_URL` in
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Node skripte jih berejo prek
  `node --env-file=.env.local ...`.
- `queued_songs` (stolpca `title`, `author`, poleg `id`/`added_at`) drži
  hitre predloge, dodane prek gumba "Hitro" v aplikaciji — SAMO naslov in
  avtor, brez ostalih podatkov.
- Stolpci `songs`: id, title, author, genre, era, favorite, mood, origin,
  image_url, chords_url, chords_source_url, copy_count, jam_added_at,
  jam_played, goal_added_at, goal_learned, created_at.
- `genre`/`era` sta zaprti enumeraciji: `GENRES`/`ERAS` v
  `src/lib/constants.ts`. Če noben žanr resnično ne ustreza, VPRAŠAJ
  uporabnika — ne izmišljuj nove vrednosti. `mood`/`origin` sta prosto
  besedilo (nova vrednost ni napaka, samo dosledno zapiši, velika
  začetnica, slovensko).
- `author_images` (stolpca `author` PK, `image_url`) drži en skupni
  bend/avtorjev portret za vse skladbe tega avtorja — preveri, ali za
  avtorja že obstaja vnos, preden iščeš/nalagaš novo sliko.
- Storage bucket `song-chords` hrani PDF akorde, `song-images` slike.
- **Znana past**: `formatEraLabel` v `src/components/HomeHighlights.tsx`
  prikaže ERO "Pred 1960" IN "1960s" kot isto oznako "60's" na domači
  strani. Preden dodeliš eno od teh dveh vrednosti, preveri (REST API
  `select=id&era=eq.<vrednost>`), katera od njiju je trenutno dejansko v
  uporabi (ima >0 skladb), in uporabi TISTO — sicer nastane podvojena
  kartica (to se je enkrat že zgodilo pri uvozu CCR).
- Vse to so SAMO podatkovne spremembe v Supabase — koda repozitorija se NE
  spreminja, zato na koncu NE delaj git commit/push (razen če si moral
  dejansko urediti kodo, npr. dodati vrednost v GENRES/DEFAULT_ORIGINS — v
  tem primeru najprej vprašaj uporabnika).

## Koraki

### 1. Preberi čakalno vrsto
```
node --env-file=.env.local -e "
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
fetch(url + '/rest/v1/queued_songs?select=*&order=added_at.asc', {
  headers: { apikey: key, Authorization: 'Bearer ' + key }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)));
"
```
Če je prazna, povej uporabniku ("Čakalna vrsta je prazna.") in končaj.

### 2. Izbira skladb
Če je v čakalni vrsti samo ena skladba, jo obdelaj direktno (brez
spraševanja). Če jih je več, uporabi **AskUserQuestion** (multiSelect) s po
eno opcijo na skladbo, oblika "Naslov — Avtor", in naj uporabnik izbere
katere naj se obdelajo zdaj (preostale ostanejo v čakalni vrsti za kasneje).

### 3. Preveri podvojenost (za vsako izbrano skladbo)
Preveri v `songs` prek `ilike` po avtorju IN po naslovu (avtor je lahko v
bazi zapisan drugače — kratica, druga velika/mala začetnica ipd.). Preveri
tudi `author_images?select=*&author=ilike.*<avtor>*` za obstoječo sliko.
Skladbo, ki že obstaja, IZPUSTI iz nadaljnjih korakov, pusti jo v
`queued_songs` (uporabnik naj ročno presodi) in to na koncu izrecno omeni.

### 4. Poišči UG akorde
Za vsako preostalo skladbo poišči na Ultimate Guitar:
```
https://www.ultimate-guitar.com/search.php?search_type=title&value=<avtor> <naslov>
```
(fetch z brskalniškim User-Agent, izlušči `js-store` `data-content`,
dekodiraj HTML entitete — vključno s š/č/ž/Š/Č/Ž, ki niso standardne
entitete — JSON.parse, filtriraj `results` po `artist_name` ki se ujema z
avtorjem). Med rezultati izberi tip "Chords" z NAJVEČ glasovi (`votes`
glavno merilo, `rating` samo kot izenačevalec). Če ni nobene "Chords"
tabulature, uporabi najboljšo alternativo in to omeni uporabniku.

### 5. Določi metapodatke
Za vsako skladbo razišči (splet, če nisi prepričan — ne ugibaj):
- **era**: leto izida originalne verzije → ustrezna vrednost ERAS
  (upoštevaj past "Pred 1960"/"1960s" iz konteksta zgoraj).
- **genre**: najboljše ujemanje z GENRES. Če res nič ne ustreza, vprašaj.
- **origin**: izvajalec iz bivše Jugoslavije → "Yugo"; slovenski → "Slovenska";
  sicer "Tuja". Če ni očitno, vprašaj.
- **mood**: `null`, razen če je uporabnik ob klicu izrecno navedel drugače.
- **title**: popravi UG-jevo odstranjena ločila/apostrofe nazaj na pravilen,
  splošno znan naslov skladbe.

### 6. Vstavi v bazo
En skupen insert v `songs` (`Prefer: return=representation`, da dobiš
`id`-je nazaj): `title`, `author` (iz queued_songs, po možnosti poravnano na
obstoječi zapis avtorja v bazi, če je bil najden pri koraku 3), `genre`,
`era`, `favorite: false`, `mood`, `origin`, `image_url: null`,
`chords_url: null`, `chords_source_url: <UG link>`.

### 7. Generiraj in naloži PDF
Za vsak `chords_source_url`: prenesi UG tab stran, izlušči `js-store`,
preberi `store.page.data.tab_view.wiki_tab.content` (`[ch]`/`[tab]`
markup), dekodiraj entitete, izriši v PDF s pdfkit (Windows fonts
`consola.ttf`/`consolab.ttf`/`arial.ttf`/`arialbd.ttf` za šumnike; brez teh
poti prilagodi). Naloži v `song-chords` bucket, `PATCH` nazaj `chords_url`
za vsako skladbo.

### 8. Slika avtorja (samo za avtorje BREZ obstoječega vnosa iz koraka 3)
Poišči preko Wikipedia REST API-ja:
```
https://en.wikipedia.org/api/rest_v1/page/summary/<Ime_Avtorja>
```
in vzemi `originalimage.source` (ali `thumbnail.source`, če originalne ni).
Prenesi z brskalniškim `User-Agent` (če vrne HTML namesto slike, poskusi
`thumb.wikimedia.org` gostitelja iz istega odziva namesto ročno sestavljene
`upload.wikimedia.org` poti). Naloži v `song-images`, vpiši/posodobi
`author_images` (`Prefer: resolution=merge-duplicates`).

### 9. Počisti čakalno vrsto
Izbriši iz `queued_songs` SAMO tiste vrstice, ki so bile dejansko uspešno
dodane v `songs` (ne tistih, izpuščenih zaradi podvojitve v koraku 3, in ne
tistih, ki jih uporabnik v koraku 2 ni izbral).

### 10. Poročaj
Povej: koliko skladb je bilo dodanih (z avtorjem/žanrom/obdobjem/izvorom za
vsako in kratko utemeljitvijo, če je bila negotova), koliko jih je bilo
izpuščenih zaradi podvojitve in katere so še vedno v čakalni vrsti (izbrane
ali ne), ali so bile dodane nove slike avtorjev. Brez git commit/push.
