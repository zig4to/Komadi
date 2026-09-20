# Komadi 🎸

Osebna aplikacija za zbiranje priljubljenih skladb za igranje na kitaro — avtor, naslov, žanr, obdobje, tonaliteta, kapo, težavnost, status učenja … Podatki se shranjujejo v Supabase.

## Postavitev

### 1. Ustvari Supabase projekt

1. Pojdi na [supabase.com](https://supabase.com) in ustvari nov projekt (nova, prazna podatkovna baza).
2. V **SQL Editor** prilepi in poženi vsebino datoteke [`supabase/schema.sql`](./supabase/schema.sql) — ustvari tabelo `songs` in vklopi RLS politike.
3. V **Project Settings → API** poišči `Project URL` in `anon public` ključ.

### 2. Nastavi okoljske spremenljivke

Skopiraj `.env.local.example` v `.env.local` in vnesi svoje vrednosti:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Zaženi aplikacijo

```bash
npm install
npm run dev
```

Odpri [http://localhost:3000](http://localhost:3000).

## Funkcionalnosti

- Dodajanje skladb (naslov, avtor, žanr, obdobje, tonaliteta, kapo, težavnost, status učenja, povezava do akordov/videa, opombe, priljubljena)
- Napredno filtriranje: iskanje po naslovu/avtorju, žanr (več izbir), obdobje (več izbir), težavnost, status, samo priljubljene
- Naključna izbira skladbe (upošteva trenutne filtre)
- Označevanje priljubljenih in brisanje skladb

## AI predlog obdobja (Supabase Edge Function)

Pri dodajanju skladbe lahko z gumbom ✨ ob polju "Obdobje" AI (Claude) predlaga desetletje glede na naslov in avtorja. Klic gre prek Supabase Edge Function `guess-era` ([`supabase/functions/guess-era/index.ts`](./supabase/functions/guess-era/index.ts)), da API ključ ostane skrit na strežniku in se nikoli ne znajde v kodi, ki jo prejme brskalnik (aplikacija je statični export brez lastnega strežnika).

### Postavitev po korakih (enkratno)

**1. Namesti Supabase CLI**

```powershell
npm install -g supabase
```

Preveri namestitev:

```powershell
supabase --version
```

(Alternativa brez globalne namestitve: povsod spodaj uporabi `npx supabase ...` namesto `supabase ...`.)

**2. Prijava v Supabase CLI**

```powershell
supabase login
```

Odpre se brskalnik, kjer potrdiš prijavo s svojim Supabase računom (tem, kjer imaš ustvarjen projekt za bazo skladb). Nazaj v terminalu se izpiše potrditev.

**3. Poveži lokalni repo s svojim Supabase projektom**

Najprej v repo korenu (`C:\Users\zizi\Desktop\PROJEKTI\Komadi`) inicializiraj CLI strukturo, če `supabase/config.toml` še ne obstaja (obstoječih datotek v `supabase/`, npr. `schema.sql` in `functions/`, s tem ne prepiše):

```powershell
supabase init
```

Nato poišči **project ref**: v [supabase.com/dashboard](https://supabase.com/dashboard) odpri svoj projekt → **Project Settings** (zobnik spodaj levo) → **General** → polje **Reference ID** (niz iz ~20 znakov, npr. `abcdefghijklmnop qrst`, brez presledkov). Isti niz je tudi del `NEXT_PUBLIC_SUPABASE_URL` (`https://<reference-id>.supabase.co`).

```powershell
supabase link --project-ref <tvoj-project-ref>
```

CLI lahko vpraša po geslu baze (database password) — to je geslo, ki si ga nastavil ob ustvarjanju projekta (ne anon key). Če si ga pozabil, ga lahko ponastaviš v **Project Settings → Database**.

**4. Pridobi Anthropic API ključ**

Pojdi na [console.anthropic.com](https://console.anthropic.com) → prijava/registracija → **API Keys** → **Create Key**. Ključ (začne se z `sk-ant-...`) se prikaže samo enkrat, zato ga takoj kopiraj. Za dejansko rabo (ne samo test) na tem računu nastavi tudi način plačila pod **Billing** — brez dobroimetja klici vračajo napako.

**5. Shrani ključ kot Supabase secret**

```powershell
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tvoj-ključ-tukaj
```

Preveri, da je nastavljen (izpiše samo ime, ne vrednosti):

```powershell
supabase secrets list
```

Ključa **ne** dodajaj v `.env.local`, `.env.local.example` ali kot `NEXT_PUBLIC_*` spremenljivko v GitHub Actions secrets — v teh primerih bi pristal v kodi, ki jo dobi brskalnik. Živi izključno kot Supabase secret, dostopen samo funkciji na strežniku.

**6. Objavi (deploy) funkcijo**

```powershell
supabase functions deploy guess-era
```

Ob uspehu CLI izpiše URL funkcije, nekaj v stilu `https://<reference-id>.supabase.co/functions/v1/guess-era`.

**7. Preizkusi funkcijo neposredno (pred testiranjem v aplikaciji)**

```powershell
$env:SUPABASE_ANON_KEY = "<tvoj-anon-key-iz-.env.local>"
Invoke-RestMethod `
  -Uri "https://<reference-id>.supabase.co/functions/v1/guess-era" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ANON_KEY" } `
  -ContentType "application/json" `
  -Body '{"title":"Wonderwall","author":"Oasis"}'
```

Pričakovan odgovor: `{"era":"1990s"}`. Če dobiš napako, glej **Odpravljanje težav** spodaj.

**8. Preizkusi v aplikaciji**

```powershell
npm run dev
```

Odpri obrazec "Dodaj skladbo", vnesi naslov in avtorja, klikni ✨ ob polju "Obdobje" — po nekaj sekundah bi se moralo polje samodejno nastaviti.

### Odpravljanje težav

- **"ANTHROPIC_API_KEY ni nastavljen"** → korak 5 (secret) ni bil shranjen v pravem projektu; preveri `supabase secrets list` po tem, ko si prepričan, da je `supabase link` povezan s pravim projektom (`supabase projects list`).
- **401 / Unauthorized pri klicu funkcije** → manjka ali je napačen `Authorization: Bearer <anon key>` header; v aplikaciji to samodejno doda `supabase-js`, pri ročnem testu (korak 7) pa ga moraš dodati sam.
- **AI napaka (401) iz Anthropic API** → API ključ je napačen/preklican; ustvari novega na console.anthropic.com in ponovi korak 5.
- **AI napaka (429) iz Anthropic API** → prekoračena kvota/hitrost; preveri dobroimetje in limite pod Billing.
- **"Nepričakovan odgovor AI"** → model ni odgovoril z eno od pričakovanih vrednosti; redko se zgodi, poskusi znova (gumb ✨).
- Spremembe v `supabase/functions/guess-era/index.ts` se ne uveljavijo same — po vsakem urejanju ponovno poženi `supabase functions deploy guess-era`.

## AI predlog podobnih skladb (Supabase Edge Function)

Ob vsaki skladbi lahko z gumbom 🔍 "Podobno" AI (Claude, s spletnim iskanjem) predlaga 5 podobnih skladb; ob vsakem predlogu je gumb **+**, ki odpre obrazec "Dodaj skladbo", predizpolnjen z naslovom in avtorjem. Klic gre prek Supabase Edge Function `similar-songs` ([`supabase/functions/similar-songs/index.ts`](./supabase/functions/similar-songs/index.ts)), iz istega razloga kot `guess-era`.

**Ta funkcija uporablja isti `ANTHROPIC_API_KEY` secret kot `guess-era`** — če si že sledil postavitvi zgoraj, ni treba ponoviti korakov 1–5. Edini nov korak je objava druge funkcije:

```powershell
supabase functions deploy similar-songs
```

Preizkusi neposredno (enak vzorec kot pri `guess-era`, korak 7 zgoraj):

```powershell
$env:SUPABASE_ANON_KEY = "<tvoj-anon-key-iz-.env.local>"
Invoke-RestMethod `
  -Uri "https://<reference-id>.supabase.co/functions/v1/similar-songs" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ANON_KEY" } `
  -ContentType "application/json" `
  -Body '{"title":"Wonderwall","author":"Oasis"}'
```

Pričakovan odgovor: `{"songs":[{"title":"...","author":"..."}, ...]}` s (do) 5 elementi. Klic traja dlje kot `guess-era`, ker vključuje spletno iskanje — tudi 10–15 sekund je normalno.

⚠️ **Opomba o stroških:** vsako odpiranje panela "Podobno" in vsak klik "Še več" je dejanski klic na Haiku z do 4 spletnimi iskanji — pogostejši in dražji klic kot `guess-era`. Kartica si zapomni zadnjih 5 rezultatov, dokler ne klikneš "Še več", zato zapiranje/ponovno odpiranje panela ne ustvari novega klica.

Napake in odpravljanje težav so enake kot pri `guess-era` (glej razdelek zgoraj).

## Backup podatkov

Supabase free tier nima samodejnih dnevnih backupov (to je plačljiva Pro funkcija), zato je na voljo ročni skript, ki celotno tabelo `songs` izvozi v lokalno JSON datoteko:

```powershell
npm run backup
```

Datoteka pristane v `backups/songs-<datum-čas>.json` (mapa je izključena iz gita — vsebuje tvoje podatke, ne kode). Poženi po večjih spremembah v repertoarju ali pred kakšnim eksperimentiranjem z bazo.

## Uvoz skladb

V **Nastavitve → Uvoz skladb** lahko z gumbom "Izberi .txt datoteko" naenkrat uvoziš več skladb iz navadne besedilne datoteke. Format:

```
Avtor: Oasis

Wonderwall
Žanr: Rock
Obdobje: 1990s
Razpoloženje: Nostalgična
Priljubljena: da

Champagne Supernova
Žanr: Rock
Obdobje: 1990s

Avtor: Queen

Bohemian Rhapsody
Žanr: Rock
Obdobje: 1970s
Priljubljena: da
```

Pravila:
- Vrstica `Avtor: Ime` velja za vse skladbe pod njo, dokler se ne pojavi naslednja `Avtor:` vrstica.
- Vsaka navadna vrstica (ki ni `Avtor:` ali eden od spodnjih parametrov) je naslov nove skladbe.
- Pod naslovom lahko dodaš neobvezne vrstice `Žanr:`, `Obdobje:`, `Razpoloženje:`, `Priljubljena:` (da/ne) — karkoli izpustiš, dobi privzeto vrednost (prvi žanr/obdobje s seznama, brez razpoloženja, ni priljubljena).
- Prazne vrstice se ignorirajo — uporabljaj jih poljubno za preglednost.
- Žanr in obdobje morata ustrezati enemu izmed obstoječih (glej `src/lib/constants.ts`), sicer dobiš opozorilo in privzeto vrednost; razpoloženje je prosto besedilo.

Po izbiri datoteke se prikaže povzetek (koliko skladb, morebitna opozorila) — šele s klikom na "Uvozi" se skladbe dejansko zapišejo v bazo.

## Varnostna opomba

Aplikacija nima prijave — `anon` ključ omogoča branje in pisanje vsem, ki poznajo URL aplikacije. Za osebno/lokalno rabo je to v redu. Če jo objaviš javno (npr. na Vercelu), razmisli o:

- Vercel Password Protection (zaščiti celoten deployment z geslom), ali
- Supabase Auth + prijava v aplikaciji.

## Deploy na GitHub Pages

Aplikacija je nastavljena za statični izvoz (`output: "export"` v `next.config.ts`) in ima pripravljen GitHub Actions workflow (`.github/workflows/deploy.yml`), ki ob vsakem pushu na `main` zgradi in objavi stran.

1. **Ustvari GitHub repozitorij** in vanj potisni to kodo (`git push`).
   - Če se repozitorij ne bo imenoval `Komadi`, spremeni `REPO_NAME` na vrhu `next.config.ts`.
2. V repozitoriju pojdi na **Settings → Pages** in pod "Build and deployment" izberi vir **GitHub Actions**.
3. V **Settings → Secrets and variables → Actions → Secrets** dodaj dva secreta (isti vrednosti kot v `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Vsak push na `main` avtomatsko zgradi in objavi stran na `https://<uporabnik>.github.io/<repo-ime>/`.
   Prvi deploy lahko sprožiš tudi ročno: zavihek **Actions → Deploy to GitHub Pages → Run workflow**.

⚠️ **Varnostna opomba za javni GitHub Pages deploy:** stran bo dostopna vsakomur, ki pozna URL, in trenutno (brez prijave) lahko vsak obiskovalec dodaja/ureja/briše skladbe v tvoji bazi, ker RLS politike dovoljujejo javni zapis. Za osebno rabo je to običajno sprejemljivo tveganje (nihče drug ne pozna URL-ja), a če želiš dodatno zaščito, razmisli o preprostem geslu ob vstopu v aplikacijo ali o Supabase Auth.

## Deploy na Vercel (alternativa)

Namesto GitHub Pages lahko uporabiš tudi [Vercel](https://vercel.com/new) — poveži repozitorij in dodaj obe okoljski spremenljivki v Project Settings → Environment Variables. V tem primeru `output: "export"` ni potreben, a mu ne škodi.
