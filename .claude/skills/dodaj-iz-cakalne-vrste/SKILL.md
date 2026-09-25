---
name: dodaj-iz-cakalne-vrste
description: "Obdelaj skladbe iz čakalne vrste (Supabase tabela queued_songs) v aplikaciji Bitne Tabs: za izbrane skladbe poišče UG chords povezavo, povezavo na zabrenkaj.si (če skladba tam obstaja) ter povezave YouTube, YouTube Music in Spotify, doda žanr/obdobje/izvor, generira PDF akorde in doda sliko avtorja, nato jih izbriše iz čakalne vrste. Sproži se, ko uporabnik reče nekaj v stilu 'dodaj/obdelaj/uvozi/vnesi skladbe iz čakalne vrste'. Uporabnik izbere, katere skladbe s seznama naj se obdelajo zdaj (če jih je več kot ena)."
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
  image_url, chords_url, chords_source_url, zabrenkaj_url, youtube_url,
  other_chords_url, spotify_url, youtube_music_url, import_batch_id, copy_count, jam_added_at,
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
- **Obdobje do vključno 60-ih = "Pred 1960"**: vse skladbe iz 60-ih in
  starejše dobijo `era: "Pred 1960"` (na domači strani se prikaže kot
  "60's"). Vrednosti "1960s" NIKOLI ne uporabi — ni v `ERAS`, a
  `formatEraLabel` (`src/components/HomeHighlights.tsx`) bi jo prav tako
  prikazal kot "60's" in na domači strani bi nastala podvojena kartica (to
  se je že zgodilo; vse skladbe "1960s" so bile prestavljene na
  "Pred 1960").
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

### 4b. Poišči skladbo na zabrenkaj.si
Za vsako preostalo skladbo preveri, ali je na zabrenkaj.si (slovenska
stran z akordi). Shrani se SAMO povezava (`zabrenkaj_url`) — vsebine
strani (besedila/akordov) ne prenašaj in ne shranjuj.

1. Enkrat prenesi seznam vseh skladb `https://www.zabrenkaj.si/vse-pesmi/`
   (brskalniški User-Agent). Vsaka skladba je
   `<div> <a href="/<slug>/">Naslov</a> </div>` — med oznakami so prelomi
   vrstic in tabulatorji, zato regex `<div>\s*<a href="\/([^"\/]+)\/">([^<]+)<\/a>\s*<\/div>`
   (brez `\s*` ne najde ničesar). Seznam je na eni strani (~2800 skladb),
   brez paginacije. Dekodiraj HTML entitete v naslovih.
2. Primerjaj naslove normalizirano: male črke, brez šumnikov/diakritike
   (NFD + odstrani `̀-ͯ`), brez vsebine v oklepajih, vsa ločila
   → presledek. Isti naslov ima lahko več kandidatov (različni izvajalci).
3. Za vsakega kandidata odpri njegovo stran in preberi SAMO `<title>`,
   ki ima obliko `Izvajalec - Naslov - Akordi za kitaro in ukulele` —
   izvajalec je del pred prvim ` - `. Kandidat se ujema, če se
   normaliziran izvajalec ujema z avtorjem skladbe (upoštevaj razlike v
   zapisu, npr. `MI2` = `Mi2`, `Hamo&Tribute2Love` = `Hamo & Tribute 2
   love` — primerjaj tudi brez presledkov). Pazi na kratka imena: `F+` se
   po normalizaciji skrči na `f`, kar se napačno "ujema" z vsakim avtorjem,
   ki vsebuje črko f — delno ujemanje (includes) dovoli samo, če ima
   krajše ime vsaj 3 znake.
4. Ujemanje → `zabrenkaj_url = https://www.zabrenkaj.si/<slug>/`. Ni
   ujemanja → `zabrenkaj_url: null`. Če je izvajalec na zabrenkaj.si
   drugačen, a bi lahko šlo za isto skladbo (npr. pevec vs. njegova
   skupina, kot Zoran Predin / Lačni Franz), povezave NE vpiši samodejno —
   vprašaj uporabnika.

### 4d. Akordi z drugih strani (samo če ni UG IN ni zabrenkaj.si)
Če skladba nima akordov na Ultimate Guitar (korak 4) NITI na zabrenkaj.si
(korak 4b), ne izpusti je takoj:
1. Če je uporabnik dal povezavo do akordov (npr. v sporočilu ob klicu),
   jo vpiši v `other_chords_url`.
2. Sicer za Yugo skladbe poskusi pesmarica.rs (iskanje po naslovu/izvajalcu)
   ali drugo znano stran z akordi; vpiši SAMO potrjeno ujemanje (izvajalec in
   naslov na strani se ujemata).
3. Če ne najdeš ničesar, vprašaj uporabnika za povezavo; brez akordov
   skladbo izpusti in navedi v poročilu.

Shrani se SAMO povezava (kot pri zabrenkaj.si), vsebine ne prenašaj — zato
PDF pri takih skladbah ne nastane (`chords_url` ostane `null`). Gumb v
meniju "Akordi" dobi ime iz domene povezave (npr. "pesmarica.rs"). Stolpec
doda migracija `supabase/migrations/0022_add_other_chords_url.sql`. V
poročilu je to `links.other`.

### 4c. Povezave za poslušanje: YouTube, YouTube Music, Spotify
Za vsako skladbo poišči in shrani VSE TRI povezave (`youtube_url`,
`youtube_music_url`, `spotify_url`), če jih še nima (nova skladba jih nima
nobene). Gumb za poslušanje (`ListenButton.tsx`) uporabi shranjeno
povezavo, če obstaja, sicer odpre iskanje "avtor naslov" — zato vpiši SAMO
zanesljivo ujemanje, sicer `null` (napačna povezava je slabša od iskanja).
Nikoli ne ugibaj in ne sestavljaj ID-jev na pamet.

**Če originala ni, vzemi najboljšo drugo različico — ne `null`.** Zahteva
uporabnika: vsaka skladba naj ima povezavo na vseh treh platformah, kadar
je skladba tam sploh na voljo. Vrstni red: original (tudi remaster, single
version) → ponovni studijski posnetek istega izvajalca → uradni live
posnetek istega izvajalca. Priredb drugih izvajalcev, karaoke ipd. ne
jemlji. `null` samo, če skladbe istega izvajalca na platformi res ni.
Katero ne-originalno različico si izbral, navedi v poročilu.

**Past pri filtriranju**: filter, ki izloča "live"/"remix"/"acoustic"
posnetke, NE sme veljati za besede, ki so del naslova skladbe (npr. "Live
Is Life" — filter na "live" je izločil vse zadetke, tudi original). Filter
uporabi samo na delu naslova ZUNAJ imena skladbe (npr. oklepaji, pripone
za " - ").

Stolpca `spotify_url`/`youtube_music_url` doda migracija
`supabase/migrations/0020_add_spotify_youtube_music_urls.sql`. Če insert/
PATCH vrne napako "column ... does not exist", uporabnika prosi, naj to
migracijo zažene v Supabase SQL Editorju, in te dve polji do takrat izpusti.

**YouTube (`youtube_url`)** — strgaj stran z rezultati iskanja:
```
https://www.youtube.com/results?search_query=<avtor naslov>[ lyrics]
```
(brskalniški `User-Agent` + `Accept-Language`), izlušči
`var ytInitialData = {...};</script>`, JSON.parse, rekurzivno poberi
`videoRenderer` (`videoId`, `title.runs[0].text`, `ownerText.runs[0].text`).
- Tuje skladbe (origin ni Slovenska/Yugo): iskanje z dodanim ` lyrics`,
  izberi **lyric video** (naslov vsebuje "lyric") — za petje zraven.
- Slovenske/Yugo: iskanje brez "lyrics", izberi **uradni video/audio**
  (kanal izvajalca, VEVO, "Official").
- Ujemanje mora vsebovati naslov skladbe IN izvajalca (v naslovu videa ali
  kot ime kanala). Izogibaj se priredbam, live verzijam, karaoke,
  "sped up"/"slowed" ipd.
- Oblika: `https://www.youtube.com/watch?v=<videoId>`.

**YouTube Music (`youtube_music_url`)** — albumska različica (NE lyric
video). NE išči "- Topic" kanalov v navadnem YouTube iskanju — pri znanih
izvajalcih so albumske skladbe prikazane pod uradnim kanalom izvajalca, zato
tako najdeš le redke. Uporabi interno iskanje YouTube Music s filtrom
"Skladbe" (brez ključa):
```
POST https://music.youtube.com/youtubei/v1/search?prettyPrint=false
Content-Type: application/json, Origin/Referer: https://music.youtube.com
{"context":{"client":{"clientName":"WEB_REMIX","clientVersion":"1.20240918.01.00","hl":"en","gl":"SI"}},
 "query":"<avtor> <naslov>","params":"EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D"}
```
Rekurzivno poberi `musicResponsiveListItemRenderer`: `videoId` iz
`playlistItemData.videoId`, stolpci `flexColumns[i].musicResponsiveListItemFlexColumnRenderer.text.runs`
(stolpec 0 = naslov, stolpec 1 = `Izvajalec • Album • trajanje`). Izberi
prvi zadetek, kjer se izvajalec ujema z avtorjem in naslov (brez pripon kot
"(2009 Remaster)", "(feat. …)") z naslovom skladbe. Oblika:
`https://music.youtube.com/watch?v=<videoId>`.

**Pazi na omejitev**: YouTube po ~20 hitrih zaporednih zahtevah začne
omejevati (prazni/drugačni rezultati). Med zahtevami počakaj 2–3 s; pri več
skladbah delaj v paketih po največ ~20 zahtev s premorom. Če odziv nima
`ytInitialData` ali nima rezultatov, ne vpiši ničesar in poskusi kasneje.

**Spotify (`spotify_url`)** — prek Spotify Web API (client credentials).
Potrebuje `SPOTIFY_CLIENT_ID` in `SPOTIFY_CLIENT_SECRET` v `.env.local`
(NIKOLI z `NEXT_PUBLIC_` predpono — ne smeta v bundle aplikacije):
1. Žeton: `POST https://accounts.spotify.com/api/token` z
   `grant_type=client_credentials` in Basic auth `id:secret`.
2. Iskanje: `GET https://api.spotify.com/v1/search?type=track&limit=10&q=track:<naslov> artist:<avtor>`
   (Bearer žeton).
3. Izberi zadetek, kjer se ime izvajalca (`artists[].name`) ujema z
   avtorjem in ime skladbe z naslovom (priponi kot " - Remastered 2011" ali
   " - 2004 Remaster" ignoriraj). Prednost ima originalni album/single pred
   kompilacijami ("Greatest Hits", "Best of") in live verzijami. Pazi na
   izjeme: pri starejših skladbah je lahko original izšel na albumu, ki ga
   Spotify označi kot kompilacijo (npr. "Ring of Fire" 1963 na "Ring Of
   Fire: The Best Of Johnny Cash") — preveri datum izida, ne samo tip
   albuma. Iskanje `track:… artist:…` včasih originala ne vrne; če ga ni,
   poskusi še navadno iskanje `<naslov> <avtor>` (brez `track:`/`artist:`),
   preden vzameš ne-originalno različico.
4. Oblika: `external_urls.spotify` (`https://open.spotify.com/track/<id>`).

Če `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` v `.env.local` NI, Spotify
preskoči (`spotify_url: null`) in na koncu uporabniku povej, da za točne
Spotify povezave potrebuje Client ID/Secret (brezplačna aplikacija na
https://developer.spotify.com/dashboard) v `.env.local`.

Isti postopek lahko uporabiš tudi za skladbe, ki so že v bazi in jim
katera od teh povezav manjka (PATCH samo manjkajoča polja) — a samo, če to
uporabnik izrecno zahteva.

### 5. Določi metapodatke
Za vsako skladbo razišči (splet, če nisi prepričan — ne ugibaj):
- **era**: leto izida originalne verzije → ustrezna vrednost ERAS
  (60-a in starejše → "Pred 1960", nikoli "1960s" — glej kontekst zgoraj).
- **genre**: najboljše ujemanje z GENRES. Če res nič ne ustreza, vprašaj.
- **origin**: izvajalec iz bivše Jugoslavije → "Yugo"; slovenski → "Slovenska";
  sicer "Tuja". Če ni očitno, vprašaj.
- **mood**: poišči na spletu (besedilo/temo/pomen skladbe — Wikipedia,
  Songfacts, "song meaning" ipd.) in na podlagi tega presodi razpoloženje.
  Najprej poskusi ujeti eno od obstoječih vrednosti `DEFAULT_MOODS` v
  `src/lib/constants.ts` (Vesela, Žalostna, Energična, Romantična,
  Umirjena, Nostalgična, Uporniška, Sanjava); če nobena resnično ne
  ustreza, lahko zapišeš novo vrednost (prosto besedilo, ni napaka — velika
  začetnica, slovensko), a raje uporabi obstoječo, če se le da. Pri
  utemeljitvi izhajaj iz dejanske teme/sporočila besedila, ne le iz
  glasbenega tempa (npr. "It's My Life" je zaradi teme uporništva/prevzema
  nadzora nad življenjem "Uporniška", ne le "Energična"). Če je uporabnik
  ob klicu izrecno navedel razpoloženje, uporabi to namesto raziskovanja.
- **title**: popravi UG-jevo odstranjena ločila/apostrofe nazaj na pravilen,
  splošno znan naslov skladbe.

### 5b. Ustvari uvoz (batch)
Vsak zagon tega skilla je EN uvoz. Tik pred vstavljanjem ustvari vrstico v
`import_batches` (`POST /rest/v1/import_batches`, telo `{}`,
`Prefer: return=representation`) in si zapomni njen `id`. Tabelo doda
migracija `supabase/migrations/0021_add_import_batches.sql` — če ne obstaja
(napaka "relation ... does not exist"), uporabnika prosi, naj jo zažene, in
nadaljuj brez batcha (`import_batch_id` izpusti), poročilo pa samo izpiši.
Batch ustvari tudi, če je bila vsaka skladba izpuščena — poročilo o
izpuščenih je prav tako koristno.

### 6. Vstavi v bazo
En skupen insert v `songs` (`Prefer: return=representation`, da dobiš
`id`-je nazaj): `import_batch_id: <id iz koraka 5b>`, `title`, `author` (iz queued_songs, po možnosti poravnano na
obstoječi zapis avtorja v bazi, če je bil najden pri koraku 3), `genre`,
`era`, `favorite: false`, `mood`, `origin`, `image_url: null`,
`chords_url: null`, `chords_source_url: <UG link>`,
`zabrenkaj_url: <povezava iz koraka 4b ali null>`,
`other_chords_url: <povezava iz koraka 4d ali null>`,
`youtube_url`, `youtube_music_url`, `spotify_url`: povezave iz koraka 4c
(ali `null`, kjer ni zanesljivega ujemanja).

### 7. Generiraj in naloži PDF
Za vsak `chords_source_url`: prenesi UG tab stran, izlušči `js-store`,
preberi `store.page.data.tab_view.wiki_tab.content` (`[ch]`/`[tab]`
markup), dekodiraj entitete, izriši v PDF s pdfkit (Windows fonts
`consola.ttf`/`consolab.ttf`/`arial.ttf`/`arialbd.ttf` za šumnike; brez teh
poti prilagodi). Naloži v `song-chords` bucket, `PATCH` nazaj `chords_url`
za vsako skladbo.

**Past (že enkrat povzročila pokvarjene PDF-je)**: UG vsebina uporablja
`&nbsp;` VSAK drugič namesto navadnega presledka (za poravnavo akordov nad
besedilom) — če ga tvoja `decodeHtml` funkcija ne pozna, ostane v izpisu
dobesedno kot besedilo `&nbsp;` namesto presledka, PDF pa je poln takih
kosov namesto pravilno poravnanih akordov. Nujno vključi `nbsp: " "` (poleg
šumnikov in `quot`/`apos`/`lt`/`gt`/`amp`) v nabor poznanih entitet, preden
izrišeš PDF — ne šele po tem, ko uporabnik opazi pokvarjen izpis.

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

### 10. Shrani poročilo v uvoz
`PATCH /rest/v1/import_batches?id=eq.<id>` s poljem `report` (JSON). Prikaže
se v aplikaciji na strani "Čakalna vrsta" → zavihek "Poročila" (skladbe
uvoza pa v zavihku "Zgodovina dodajanja", prek `songs.import_batch_id`).
Oblika (tip `ImportReport` v `src/types/song.ts`; besedila slovensko):
```json
{
  "added": [{
    "song_id": "<uuid>", "title": "...", "author": "...",
    "genre": "...", "era": "...", "origin": "...", "mood": "...",
    "mood_reason": "kratka utemeljitev po temi besedila",
    "links": { "ug": true, "pdf": true, "zabrenkaj": false, "other": false,
               "youtube": true, "youtube_music": true, "spotify": true },
    "note": "posebnost te skladbe (npr. ne-originalna različica) ali izpusti"
  }],
  "skipped": [{ "title": "...", "author": "...", "reason": "že v knjižnici / ..." }],
  "remaining": [{ "title": "...", "author": "..." }],
  "author_images": ["Izvajalec", "..."],
  "notes": ["negotove odločitve, stvari za preveriti, odprta vprašanja"]
}
```
`links` naj odraža DEJANSKO stanje v bazi po koncu uvoza (tudi PDF iz
koraka 7). `remaining` = vse, kar je po koraku 9 še v `queued_songs`.

### 11. Poročaj
Povej: koliko skladb je bilo dodanih (z avtorjem/žanrom/obdobjem/izvorom/
razpoloženjem za vsako, s kratko utemeljitvijo razpoloženja in kjerkoli
drugje negotove izbire, ali je bila najdena na zabrenkaj.si, in katere od
povezav YouTube/YouTube Music/Spotify so bile najdene — za manjkajoče
na kratko zakaj),
koliko jih je bilo izpuščenih zaradi podvojitve in
katere so še vedno v čakalni vrsti (izbrane
ali ne), ali so bile dodane nove slike avtorjev. Brez git commit/push.
