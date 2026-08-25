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
  "Punk",
  "Metal",
  "Grunge",
  "Pop",
  "Pop rock",
  "Alternative",
  "Indie",
  "Blues",
  "Country",
  "Folk",
  "Jazz",
  "Funk",
  "Soul",
  "Reggae",
  "Balada / akustika",
] as const;

export const DIFFICULTIES = ["Lahko", "Srednje", "Težko"] as const;

export const STATUSES = ["Za naučiti", "V učenju", "Naučeno"] as const;

export type Era = (typeof ERAS)[number];
export type Genre = (typeof GENRES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Status = (typeof STATUSES)[number];
