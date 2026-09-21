import type { Song } from "@/types/song";

// Ponovljiv (seed-iran) generator naključnih števil — enak seed vedno da
// enako zaporedje, kar omogoča "naključno" izbiro, ki ostane stabilna
// znotraj istega dne, a se spremeni naslednji dan.
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface FeaturedGroup {
  author: string;
  songs: Song[];
}

// Vsak dan izbere `authorCount` avtorjev (ki imajo vsaj `songsPerAuthor`
// skladb) in za vsakega `songsPerAuthor` njegovih skladb — izbira je
// naključna, a stabilna ves dan (isti datum -> isti rezultat).
export function pickDailyFeatured(
  songs: Song[],
  authorCount = 2,
  songsPerAuthor = 3,
): FeaturedGroup[] {
  const todayKey = new Date().toISOString().slice(0, 10);

  const byAuthor = new Map<string, Song[]>();
  for (const s of songs) {
    const list = byAuthor.get(s.author);
    if (list) list.push(s);
    else byAuthor.set(s.author, [s]);
  }

  const eligible = Array.from(byAuthor.entries()).filter(
    ([, list]) => list.length >= songsPerAuthor,
  );
  if (eligible.length === 0) return [];

  const authorRand = mulberry32(hashStringToSeed(`${todayKey}:authors`));
  const chosen = seededShuffle(eligible, authorRand).slice(0, authorCount);

  return chosen.map(([author, list]) => {
    const songRand = mulberry32(hashStringToSeed(`${todayKey}:${author}`));
    return { author, songs: seededShuffle(list, songRand).slice(0, songsPerAuthor) };
  });
}
