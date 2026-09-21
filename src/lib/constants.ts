export const ERAS = [
  "Pred 1960",
  "1960s",
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
export const ERA_IMAGES: Record<Era, string> = {
  "Pred 1960": "/images/eras/60s.jpg",
  "1960s": "/images/eras/1960s.jpg",
  "1970s": "/images/eras/70s.jpg",
  "1980s": "/images/eras/80s.jpg",
  "1990s": "/images/eras/90s.jpg",
  "2000s": "/images/eras/2000s.jpg",
  "2010s": "/images/eras/2010s.jpg",
  "2020s": "/images/eras/2020s.jpg",
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
