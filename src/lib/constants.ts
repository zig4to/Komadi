export const ERAS = [
  "Pred 1960",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;

export const GENRES = [
  "Rock",
  "Klasični rock",
  "Hard rock",
  "Yugo rock",
  "Punk",
  "Metal",
  "Pop",
  "Pop rock",
  "Indie",
  "Blues",
  "Country",
  "Reggae",
  "Balada / akustika",
  "Dalmatinske",
] as const;

export type Era = (typeof ERAS)[number];
export type Genre = (typeof GENRES)[number];

// Slika za kartico obdobja na domači strani (public/images/eras/README.md
// opisuje pričakovana imena datotek). Manjkajoča slika ni napaka — kartica
// brez slike se izriše enako kot prej (samo barvni gradient).
//
// Pot mora vključevati basePath ("/Komadi" na GitHub Pages) — brez tega se
// slike v produkciji ne naložijo (404), čeprav v `npm run dev` delujejo, ker
// tam basePath ni nastavljen.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const ERA_IMAGES: Record<Era, string> = {
  "Pred 1960": `${BASE_PATH}/images/eras/60s.jpg`,
  "1970s": `${BASE_PATH}/images/eras/70s.jpg`,
  "1980s": `${BASE_PATH}/images/eras/80s.jpg`,
  "1990s": `${BASE_PATH}/images/eras/90s.jpg`,
  "2000s": `${BASE_PATH}/images/eras/2000s.jpg`,
  "2010s": `${BASE_PATH}/images/eras/2010s.jpg`,
  "2020s": `${BASE_PATH}/images/eras/2020s.jpg`,
};

// Razpoloženje je neobvezno in uporabniško razširljivo (ni fiksen nabor kot
// žanr/obdobje) — to je samo začetni predlagan seznam za obrazec; nova,
// ročno vnesena razpoloženja se shranijo kot navadno besedilo in se nato
// pojavijo v seznamih za izbiro/filtriranje.
export const DEFAULT_MOODS = [
  "Vesela",
  "Žalostna",
  "Energična",
  "Romantična",
  "Umirjena",
  "Nostalgična",
  "Uporniška",
  "Sanjava",
] as const;

// Izvor je enako neobvezen in uporabniško razširljiv kot razpoloženje — to
// je samo začetni predlagan seznam za obrazec/filter; nov, ročno vnesen
// izvor se shrani kot navadno besedilo in se nato pojavi v seznamih za
// izbiro/filtriranje.
export const DEFAULT_ORIGINS = ["Slovenska", "Tuja", "Yugo", "Španska"] as const;
