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
] as const;

export type Era = (typeof ERAS)[number];
export type Genre = (typeof GENRES)[number];

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
