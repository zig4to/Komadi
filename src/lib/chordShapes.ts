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

// Prijemi, zapisani v opisu skladbe (kot na Ultimate Guitar:
// "Cadd4    x 3 3 0 1 0", "Gadd11 320013", "F: x-3-3-2-1-x") → ime → prijem.
// Pragovi so absolutni (od E do e); nad 4. pragom se shema premakne
// (baseFret = najnižji pritisnjen prag). Prste in barre opis ne pove —
// ugane jih guessFingers.
const DESC_SHAPE_RE = /^\s*([A-H][#b]?[^\s:=]*)\s*[:=]?\s+((?:[xX\d]{1,2}[\s-]*){6})\s*$/;
export function parseDescriptionShapes(content: string): Map<string, ChordPosition> {
  const shapes = new Map<string, ChordPosition>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\[\/?ch\]/g, "");
    const m = line.match(DESC_SHAPE_RE);
    if (!m) continue;
    const spec = m[2].trim();
    const tokens = /[\s-]/.test(spec) ? spec.split(/[\s-]+/) : spec.split("");
    if (tokens.length !== 6) continue;
    const abs = tokens.map((t) => (/^[xX]$/.test(t) ? -1 : Number(t)));
    if (abs.some((f) => Number.isNaN(f) || f > 24)) continue;
    const pressed = abs.filter((f) => f > 0);
    const top = Math.max(0, ...pressed);
    const baseFret = top <= 4 ? 1 : Math.min(...pressed);
    const frets = abs.map((f) => (f <= 0 ? f : f - baseFret + 1));
    shapes.set(m[1], { frets, ...guessFingers(frets), baseFret });
  }
  return shapes;
}

// Prsti za prijem iz opisa (opis jih ne pove): po pragovih navzgor, na istem
// pragu od debele strune proti tanki; razmak 2 pragov preskoči prst (C: 1 na
// H, 2 na D, 3 na A; F x3321x: 3 na A, 4 na D). Več kot 4 pritisnjene strune
// → barre s 1. prstom na najnižjem pragu, ostale z 2–4.
function guessFingers(frets: number[]): { fingers: number[]; barres: number[] } {
  const fingers = [0, 0, 0, 0, 0, 0];
  const notes = frets
    .map((fret, string) => ({ fret, string }))
    .filter((n) => n.fret > 0)
    .sort((a, b) => a.fret - b.fret || a.string - b.string);
  if (!notes.length) return { fingers, barres: [] };
  const barres: number[] = [];
  let rest = notes;
  let prev = { finger: 0, fret: notes[0].fret };
  if (notes.length > 4) {
    const low = notes[0].fret;
    const onLow = notes.filter((n) => n.fret === low);
    rest = notes.filter((n) => n.fret !== low);
    if (onLow.length < 2 || rest.length > 3) return { fingers, barres: [] };
    onLow.forEach((n) => (fingers[n.string] = 1));
    barres.push(low);
    prev = { finger: 1, fret: low };
  }
  rest.forEach((n, i) => {
    const remaining = rest.length - i - 1;
    const stretch = prev.finger === 0 ? 1 : prev.finger + Math.max(1, n.fret - prev.fret);
    const finger = Math.max(prev.finger + 1, Math.min(stretch, 4 - remaining));
    fingers[n.string] = finger;
    prev = { finger, fret: n.fret };
  });
  return { fingers, barres };
}
