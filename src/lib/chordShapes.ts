// Prijemi kitarskih akordov za sheme v ChordsViewer.tsx (kot na Ultimate
// Guitar): podatki iz @tombatossals/chords-db (MIT, lib/guitar.json —
// 12 tonov × ~65 vrst akordov). JSON se naloži šele ob prvi shemi.

export type ChordPosition = {
  // Od najnižje (E) do najvišje (e) strune: -1 = ne igraš, 0 = prazna,
  // sicer prag relativno na baseFret (1 = prvi prikazani prag).
  frets: number[];
  fingers: number[];
  barres: number[];
  baseFret: number;
};
type ChordDb = {
  chords: Record<string, { key: string; suffix: string; positions: ChordPosition[] }[]>;
};

let dbPromise: Promise<ChordDb> | null = null;
export function loadChordDb(): Promise<ChordDb> {
  dbPromise ??= import("@tombatossals/chords-db/lib/guitar.json").then((m) => m.default as unknown as ChordDb);
  return dbPromise;
}

// Ton → ključ v bazi (enharmonično; H = B v slovenskem zapisu).
const DB_KEY: Record<string, string> = {
  C: "C", "B#": "C", "C#": "Csharp", Db: "Csharp", D: "D", "D#": "Eb", Eb: "Eb", E: "E", Fb: "E",
  F: "F", "E#": "F", "F#": "Fsharp", Gb: "Fsharp", G: "G", "G#": "Ab", Ab: "Ab", A: "A",
  "A#": "Bb", Bb: "Bb", B: "B", H: "B", Cb: "B",
};
// Bas → zapis v priponi baze ("/F#", "m/G#" …).
const DB_BASS: Record<string, string> = {
  C: "C", "C#": "C#", Db: "C#", D: "D", "D#": "D#", Eb: "D#", E: "E", F: "F", "F#": "F#", Gb: "F#",
  G: "G", "G#": "G#", Ab: "G#", A: "A", "A#": "Bb", Bb: "Bb", B: "B", H: "B",
};
// Zapisi pripon, ki jih baza piše drugače.
const SUFFIX_ALIAS: Record<string, string> = {
  "": "major", M: "major", maj: "major", m: "minor", min: "minor", "-": "minor",
  M7: "maj7", "Δ": "maj7", min7: "m7", "-7": "m7", sus: "sus4", "7sus": "7sus4",
  "°": "dim", o: "dim", "°7": "dim7", "+": "aug", add2: "add9", "2": "sus2",
};

// Polton tona (C = 0) — za power akorde, ki jih baza nima.
const SEMITONE: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, H: 11, Cb: 11,
};

// Power akord ("D5"): koren + kvinta + oktava, s korenom na struni E in na
// struni A (nižja lega prva). Zapis kot v bazi: pragovi relativno na baseFret.
function powerChordShapes(root: string): ChordPosition[] {
  const n = SEMITONE[root];
  if (n === undefined) return [];
  const shape = (string: 0 | 1, fret: number): ChordPosition => {
    const open = fret === 0;
    const base = open ? 1 : fret;
    const r = open ? 0 : 1;
    const frets = [-1, -1, -1, -1, -1, -1];
    const fingers = [0, 0, 0, 0, 0, 0];
    [r, r + 2, r + 2].forEach((f, i) => {
      frets[string + i] = f;
      fingers[string + i] = open ? [0, 1, 2][i] : [1, 3, 4][i];
    });
    return { frets, fingers, barres: [], baseFret: base };
  };
  const onE = (n - 4 + 12) % 12;
  const onA = (n - 9 + 12) % 12;
  return onE <= onA ? [shape(0, onE), shape(1, onA)] : [shape(1, onA), shape(0, onE)];
}

// "Dm" → vse različice prijema po vrsti iz baze (prva = osnovna/odprta, nato
// barre in višje lege, npr. Dm na 1. in barre na 5. pragu); neznan akord → [].
export function findChordShapes(db: ChordDb, name: string): ChordPosition[] {
  const m = name.replace(/\*+$/, "").match(/^([A-H])([#b]?)(.*)$/);
  if (!m) return [];
  const entries = db.chords[DB_KEY[m[1] + m[2]] ?? ""];
  if (!entries) return [];
  let rest = m[3];
  const bassMatch = rest.match(/\/([A-H][#b]?)$/);
  if (bassMatch) rest = rest.slice(0, -bassMatch[0].length);
  const quality = SUFFIX_ALIAS[rest] ?? rest;
  if (quality === "5") return powerChordShapes(m[1] + m[2]);
  const find =(suffix: string) => entries.find((e) => e.suffix === suffix)?.positions ?? [];
  if (bassMatch) {
    const bass = DB_BASS[bassMatch[1]];
    const withBass = quality === "major" ? find(`/${bass}`) : quality === "minor" ? find(`m/${bass}`) : [];
    if (withBass.length) return withBass;
  }
  return find(quality);
}
