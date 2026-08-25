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
