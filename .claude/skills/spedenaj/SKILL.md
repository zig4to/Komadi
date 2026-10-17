---
name: spedenaj
description: "Pripravi skladbo iz 'Pregled in odobritev' (songs.review_pending) za uporabnikov končni pregled v aplikaciji Bitne Tabs: zaklene en YouTube video, preveri popolnost besedila glede na LRCLIB, doda manjkajoči intro z akordi, oštevilči oznake delov (Verse 1, Chorus 2, Solo 1 …), natapka akorde introv in solov iz zvočne analize posnetka, preveri in popravi čase vrstic (brez prehitevanja) ter poroča, ali se akordi/tonaliteta taba ujemajo s posnetkom. Sproži se, ko uporabnik reče 'spedenaj' (npr. 'spedenaj Break My Stride', 'spedenaj skladbe v pregledu'). Za zdaj samo ročno — ne kot del dodaj-iz-cakalne-vrste."
---

## Kontekst (ne raziskuj, samo uporabi)

- Kar uporabnik zdaj dela ročno, naredi ti; uporabnik na koncu naredi samo glavni pregled in obe potrditvi
  ("Akordi preverjeni", "Predvajalnik preverjen") — **teh oznak nikoli ne nastavi sam**.
- Delaš samo na skladbah z `review_pending = true`. **Skladbe z `verified_player_at` ne spreminjaj** (pravilo iz
  CLAUDE.md, `song.mjs write` jih zavrne).
- Orodji (vse branje/pisanje gre prek njiju, z istimi funkcijami kot aplikacija):
  - `node --env-file=.env.local scripts/spedenaj/song.mjs <ukaz>` — `list`, `videos <id>`, `editable <id> --out f`,
    `dump <id> [--text osnutek] [--audio a.json]`, `write <id> --patch p.json [--write]`. Opis ukazov in oblike
    `patch.json` je na vrhu datoteke. Brez `--write` samo pokaže, kaj bi zapisal; z `--write` pred zapisom shrani
    staro vrstico v `backups/spedenaj/` (vrnitev: PATCH teh polj nazaj).
  - `"$LOCALAPPDATA/Komadi/spedenaj-venv/Scripts/python" scripts/spedenaj/audio.py <videoId> --out a.json` — prenese
    zvok, vrne začetek glasbe, BPM, mrežo taktov (`downbeat` + k·`bar`) in za vsako polovico takta 3 najverjetnejše
    trozvoke + surovi kromagram. Zvok se po analizi izbriše. Okolje enkrat:
    `py -m venv "$LOCALAPPDATA/Komadi/spedenaj-venv"` in `…/Scripts/python -m pip install yt-dlp imageio-ffmpeg numpy`.
    Če prenos vrne 403, posodobi yt-dlp (`pip install -U yt-dlp`) in poskusi znova.
- Začasne datoteke (osnutki, `a.json`, `patch.json`) piši v scratchpad seje, ne v repozitorij.
- Kako aplikacija uporablja podatke (podrobno v CLAUDE.md, "Pametni predvajalnik" in "Preverjene skladbe"):
  - `chords_text` = UG zapis; telo pesmi = vse od prve oznake/vrstice akordov naprej; indeksi vrstic v `dump`
    so indeksi telesa — na njih se vežejo vsi časi.
  - Brez `synced_lines` aplikacija čase vrstic računa sproti iz LRCLIB (`alignLyrics`, samo naprej, vsaka zapeta
    vrstica mora biti v tabu toliko krat, kot se poje). Z `synced_lines` veljajo shranjeni časi (kot "Posnemi čase").
  - `synced_chords` = deli z akordi (Intro, Solo 1 …): vsaka točka `{t, line, chord}`, `chord` = indeks `j` iz
    `dump` (pri vrsticah z besedilom je to indeks kosa, ne zaporedna številka akorda!). Veljajo samo na
    `synced_chords.videoId`.
  - `preferred_video_id` = video za vse naprave; vsi časi in zamiki so vezani nanj.
- **Pravila pisanja taba** (iz CLAUDE.md, uporabnikova odločitev): vsaka zapeta vrstica po vrsti, tolikokrat, kot
  se poje — brez "2x", "Refren", skrajšanih refrenov; besedilo kot na posnetku; instrumentalni deli kot vrstice
  samih akordov pod oznako (`[Intro]`, `[Solo 1]`); opombe samo v opisu (nad prvo oznako); zelo dolge vrstice
  razdeli (najdaljša vrstica določi velikost pisave v Sam Špili).

## Koraki (za vsako skladbo posebej)

### 0. Izbira
`song.mjs list` → pokaži skladbe v pregledu (preverjene so označene in jih preskoči). Če uporabnik ni povedal
katere, ga vprašaj (več jih lahko izbere). Za vsako skladbo `song.mjs dump <id>` za začetno stanje.

**Naslov in izvajalec**: če sta napisana narobe (tipkarska napaka, manjkajoča črka, neuradno črkovanje — npr.
"Eddie Rabbit" / "Driving my life away" namesto "Eddie Rabbitt" / "Drivin' My Life Away"), ju **kar popravi**
(uporabnikova odločitev) — tudi ko LRCLIB zato ne najde besedila (`dump`: "LRCLIB nima…"), preveri iskanje s
pravilnim imenom (`lrclib.net/api/search?track_name=…&artist_name=…`). Pred popravkom:
- poglej `author_images` za staro in novo ime: obstaja slika pod novim imenom → skladba se pridruži temu izvajalcu;
  obstaja samo pod starim → prepiši tudi vrstico v `author_images` (sicer kartica izgubi sliko);
- shrani `{id, title, author}` v `backups/spedenaj/<id>-title-author-<čas>.json`, nato PATCH `songs` (REST s
  service role ključem, kot `song.mjs`). Aplikacija ob spremenjenem naslovu/izvajalcu sama znova poišče LRC.
V poročilu navedi staro → novo ime.

### 1. Video (izberi in zakleni)
1. `song.mjs videos <id>` → kandidati z naslovom in kanalom.
2. Uporabnikova odločitev: **raje neuradni** posnetki (lyric/audio uploadi drugih kanalov — ne `…VEVO`, ne
   `- Topic`, ne uradni kanal izvajalca), ki **začnejo glasbo takoj**. Ne live, ne extended, ne intervjuji.
3. Za 1–3 najboljše po naslovu zaženi `audio.py` in vzemi tistega z:
   - `musicStart` < ~1,5 s,
   - dolžino blizu dolžine LRC kandidata (`dump` izpiše izbranega; ±3 s), sicer se čase LRC ne da uporabiti.
4. oEmbed "vgradnja OK" je samo namig — YouTube lahko vgradnjo zavrne šele v predvajalniku (napaka 150). Če
   uporabnik kasneje javi, da video ne igra, izberi naslednjega in ponovi korake 5–6.
5. Video gre v patch kot `"video"`, njegova analiza (`a.json`) se uporablja v vseh naslednjih korakih.
6. Če ima skladba že `synced_chords`/`synced_lines` za drug video, jih je treba za novi video narediti znova
   (ne samo prestaviti) — uporabnika na to opozori v poročilu.

### 2. Popolnost besedila
1. `song.mjs editable <id> --out osnutek.txt` → besedilo "akordi nad besedilom".
2. Iz `dump`: **LRC vrstice brez para** = zapete vrstice, ki jih tab nima (ali so napisane drugače). Za vsako:
   - refren/kitica, zapisana enkrat ali z "2x"/"Refren"/"(Chorus)": izpiši jo v celoti na mestu, kjer se poje,
     z akordi z mesta, kjer je prvič zapisana (stolpci akordov morajo ostati nad pravimi zlogi);
   - drugače zapisana vrstica: popravi besedilo, da se ujema s posnetkom (LRC je vodilo; tipkarske napake taba);
   - manjkajoča vrstica: dodaj jo z akordi, ki jih ima ta del drugje (enak del, ponovitev).
3. Odstrani "2x", "x2", "Repeat", "Refren" opombe iz telesa (ponovitve morajo biti izpisane).
4. **Brez LRC** (`dump` to pove): preveri samo očitne bližnjice (2x, "Refren", "(Chorus)") — jih izpiši, če je jasno,
   kaj ponavljajo, sicer javi v poročilu. Časov vrstic pri teh skladbah ne urejaj (uporabnikova odločitev).
5. Po urejanju `song.mjs dump <id> --text osnutek.txt` → "LRC vrstice brez para" mora biti 0 (ali samo vrstice, ki
   so res samo spremljevalni vokal/vzklik — te navedi v poročilu).

### 3. Intro
1. Če telo že ima `[Intro]` (ali `Intro`/`Uvod`) z vrstico akordov → **pusti, kot je**.
2. Če ga ni: iz `a.json` vzemi polovice taktov od `musicStart` do začetka prve zapete vrstice (LRC čas + zamik) in
   določi akorde:
   - kromagram primerjaj z akordi taba (intro je skoraj vedno iz akordov prve kitice ali refrena — uporabi njihova
     imena, ne surovih trozvokov iz analize);
   - **zapiši vse takte** (uporabnikova odločitev): en akord na takt, noben takt ne sme manjkati — število akordov
     = (konec − začetek) / bar; preveri, da se izide (Drivin' My Life Away: Solo 1 je bil zapisan s 3 akordi, slišijo
     se 4). Kjer se akord menja sredi takta (ali se ponovi z drugo barvo, npr. E → E7), zapiši tudi to polovico
     (`C#m A E7 E7`); enak akord čez več taktov ponovi za vsak takt. Isto velja za vse instrumentalne dele (solo,
     interludij, outro);
   - vstavi `[Intro]` + vrstico akordov na začetek telesa (pred prvo oznako, za opisom).

### 4. Oznake delov
1. Vsak del telesa mora imeti oznako v svoji vrstici: `[Intro]`, `[Verse 1]`, `[Verse 2]`, `[Pre-Chorus 1]`,
   `[Chorus 1]`, `[Chorus 2]`, `[Bridge]`, `[Solo 1]`, `[Solo 2]`, `[Interlude]`, `[Outro]`.
   - Številko dobijo deli, ki se ponovijo (Chorus 1, 2, 3); enkratni deli (Bridge, Outro, Intro) brez številke.
   - Kitica brez oznake → določi jo po vsebini (enaki akordi/besedilo kot drugje → isti tip dela).
2. **Instrumentalni deli, ki jih tab nima**: `dump` izpiše "Instrumentalni premori v LRC (≥ 6 s)". Za vsak premor
   (razen intra) preveri v `a.json`, ali se tam igra (rms ni tišina): če tab tam nima dela, dodaj `[Solo N]` (ali
   `[Interlude]`) z vrstico akordov iz kromagrama (spet z imeni akordov taba; pogosto je to progresija kitice).
   Ena vrstica = 4–8 akordov; daljše razdeli.
   - Preveri tudi vrstico "Možni instrumentalni deli brez prazne LRC vrstice" — LRC pogosto nima prazne vrstice
     pred solom za refrenom (Drivin' My Life Away: 9 s za Chorusom 1 ni bilo med premori). V `a.json` preveri,
     ali se tam igra, in naredi del kot zgoraj.
   - **Akordi sola/interludija gredo vedno v svojo vrstico pod svojo oznako** (uporabnikova odločitev), nikoli na
     konec zapete vrstice: tab pogosto piše "`Lookin' for a sunny day.  C#m A E7`" — premakni `C#m A E7` v
     `[Solo N]` (če se tam nadaljuje še kaj, dodaj na isto vrstico, npr. `C#m A E7 E D`), zapeti vrstici pusti
     samo akorde nad njenimi zlogi in ji konec (`lineOverrides.end`) skrajšaj na začetek sola.
3. Zelo dolge vrstice (besedilo > ~45 znakov ali akordov > 8) razdeli na dve, akorde pa porazdeli nad pravimi zlogi.
4. Zapiši besedilo: patch `{"text": "osnutek.txt", "video": "…", "duration": <dolžina videa>}` → `write` brez
   `--write`, preglej povzetek, nato z `--write`. Takoj zatem `dump <id> --audio a.json` (indeksi vrstic so zdaj novi).

### 5. Tapkanje intra in solov (`synced_chords`)
1. **Najprej preveri mrežo taktov**: v `a.json` morajo akordi prve kitice (iz `dump`) padati na začetke taktov
   (`downbeat + k·bar`). Če se menjave dosledno zgodijo pol takta kasneje/prej, premakni mrežo za pol takta
   (`downbeat ± bar/2`). (Pri Break My Stride se intro in kitica začneta na udarcu takta, glasba od 0,72 s.)
2. Za vsak intro in solo naredi en del (`name` = oznaka iz taba: "Intro", "Solo 1", …):
   - vsak akord vrstice dobi čas začetka svojega takta — po vrsti, kot jih kromagram potrdi (za vsako polovico
     takta preveri, da ima akord iz taba visoko oceno; če taktov več kot akordov, je akord dolg več taktov);
   - več akordov v enem taktu (npr. `C C Dm C7/E`) → po udarcih (`bar/4`); to označi v poročilu kot negotovo;
   - `end` = začetek naslednje zapete vrstice (LRC čas + zamik) ali konec instrumentalnega dela;
   - `line`/`chord` = indeksi iz zadnjega `dump` (`j` pri vsakem akordu).
3. Patch `{"chordSections": [ … ]}` → `write` (najprej brez `--write`).

### 6. Časi vrstic (samo skladbe z LRC)
Cilj: vrstica je označena natanko takrat, ko se poje — nič prehitevanja, nič označevanja čez instrumentalni del.
0. **Prava LRC različica**: aplikacija izbere različico po dolžini videa — `dump --audio` uporabi isto (dolžino iz
   `a.json`). `dump` izpiše "vse različice"; z `--album "…"` si oglej drugo. Primerjaj čase vrstic po delih z
   menjavami akordov v `a.json` (posebej po dolgih premorih: solo, bridge). Če se druga različica bolje ujema, patch
   `"lrcAlbum": "…", "saveLines": true` (in morebitni `lineOverrides`) → shranjeni časi iz te različice. Primer
   Dreamer: po dolžini videa izbrana "Down To Earth" je imela Verse 3 in zadnje refrene ~6,8 s prepozno, "Best Metal
   Ballads" se je ujemala povsod.
1. **Globalni zamik**: primerjaj LRC začetke delov (prva vrstica kitice/refrena) z menjavami akordov v `a.json`
   (prvi akord vrstice mora zazveneti ob njenem LRC času, oz. na najbližjem taktu, če se petje začne z
   dvigom/predtaktom). Če so vse vrstice dosledno zamaknjene za ≥ 0,25 s, patch `"lrcOffset": <sekunde>`
   (pozitivno = besedilo kasneje).
2. **Vrstice v napačnem delu**: za vsak del preveri, da LRC čas njegove prve vrstice pade tja, kjer kromagram kaže
   akorde tega dela (in ne npr. sredi sola). Tipična napaka LRCLIB: prva vrstica po solu ima čas iz sredine sola
   (Break My Stride: bridge 1:36 namesto 1:45,6 — ostale vrstice bridga so bile pravilne, razmik ~4,3 s). Pravi čas
   = začetek takta, kjer se začnejo akordi tega dela (preveri z razmikom do naslednjih vrstic).
3. **Konci**: vrstica pred instrumentalnim delom ne sme ostati označena čez njega — `end` naj bo konec petja
   (aplikacija sama omeji na 0,9 s/besedo, a če je LRC konec očitno predolg, ga v override skrajšaj).
4. Popravke zapiši kot `"lineOverrides": [{ "line", "t", "end" }]` → `write` naredi `synced_lines` iz LRC poravnave
   (ali obstoječih shranjenih časov) + popravkov, s ključi. Če popravkov ni, `synced_lines` NE zapisuj (aplikacija
   ostane na sprotnem LRCLIB).

### 7. Akordi glede na posnetek (samo poročilo)
`dump <id> --audio a.json` izpiše ujemanje: najboljši premik tonalitete (≠ 0 → tab je morda v drugi tonaliteti ali
s capom — preveri, ali opis taba omenja capo) in vrstice, kjer se akordi slabo ujemajo. Akordov kitic/refrenov
**ne spreminjaj** — samo navedi v poročilu (uporabnikova odločitev).

**Primerjava z zabrenkaj.si** (uporabnikova odločitev): če ima skladba `zabrenkaj_url` (ali je pesem na
zabrenkaj.si — poišči na `https://www.zabrenkaj.si/vse-pesmi/` in povezavo zapiši v `zabrenkaj_url`, samo
povezavo, nikoli vsebine), preveri tudi akorde od tam: po vrsticah primerjaj akorde taba z zabrenkaj in s
posnetkom (`a.json`) ter v poročilu navedi, kje se razlikujejo in kateri vir se bolje ujema s posnetkom.
Pozor: stran akorde pogosto naloži šele v brskalniku (v HTML jih ni — Z Goričkega v Piran); takrat poskusi z
brskalnikom (Claude in Chrome), sicer v poročilu napiši, da jih ni bilo mogoče prebrati. Akordov taba tudi
tu ne spreminjaj sam — samo poročaj.

### 8. Končna kontrola in poročilo
0. **Nasvet (ponavljajoča se zaporedja)**: ko je besedilo z oznakami delov zapisano, zaženi
   `song.mjs tips <id> --write` — poišče, ali se cela skladba vrti na enem zaporedju akordov ali imajo vse kitice /
   refreni … isto zaporedje (`src/lib/chordPatterns.ts`), in to shrani v `songs.chord_tips` (null, če ni ničesar);
   pregledovalnik to pokaže v okencu "Nasvet" desno od akordov skladbe. V poročilu navedi, kaj je našel.
   Po vsaki kasnejši spremembi besedila (akordi, oznake) ga zaženi znova.
1. `song.mjs dump <id> --audio a.json` še enkrat: brez LRC vrstic brez para, deli z akordi na pravem videu,
   shranjeni časi naraščajo, oznake delov oštevilčene.
2. Poročaj za vsako skladbo (kratko, slovensko):
   - izbran video (naslov, kanal, glasba od X s) in zakaj;
   - besedilo: dodane/popravljene vrstice, izpisani refreni, dodan intro, nove oznake;
   - natapkani deli (ime, čas od–do, število akordov) in negotova mesta;
   - popravljeni časi vrstic in zamik;
   - ujemanje akordov/tonalitete s posnetkom;
   - kaj ostane uporabniku: glavni pregled v aplikaciji (Pregled in odobritev → skladba → Sam Špili in navadni
     pogled ob predvajanju) ter "Akordi preverjeni" in "Predvajalnik preverjen".
3. Vse prejšnje stanje je v `backups/spedenaj/` — povej, da se da vrniti.
