// Iskanje skladb po naslovu in avtorju: vse besede poizvedbe v poljubnem
// vrstnem redu, vsaka kot del besede ("hank william i got rights" najde
// "I've Got Rights — Hank Williams Jr."); brez velikih črk, šumnikov in ločil
// (apostrof se zlije: "ive" = "I've").
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchWords(query: string): string[] {
  return normalizeSearch(query).split(" ").filter(Boolean);
}

export function matchesSearch(words: string[], ...fields: (string | null | undefined)[]): boolean {
  if (!words.length) return true;
  const hay = ` ${normalizeSearch(fields.filter(Boolean).join(" "))}`;
  return words.every((w) => hay.includes(w));
}
