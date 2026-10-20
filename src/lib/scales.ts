// Lestvice za vrat kitare (Scales.tsx, Impro v ChordsViewer.tsx) in zaznava
// tonalitete skladbe iz njenih akordov.

export const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const INTERVALS: Record<number, string> = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
// E2 A2 D3 G3 B3 E4 (MIDI), od nizke E navzgor.
export const OPEN = [40, 45, 50, 55, 59, 64];
export const FRETS = 19;

export type Scale = {
  id: string;
  name: string;
  // Toni, iz katerih se gradijo položaji (nps tonov na struno).
  base: number[];
  // Dodatni toni (blue nota), dodani znotraj razpona boksa na vsaki struni.
  extra?: number[];
  nps: number;
  sharp4?: boolean;
};

export const SCALES: Scale[] = [
  { id: "minpent", name: "Mol pentatonika", base: [0, 3, 5, 7, 10], nps: 2 },
  { id: "majpent", name: "Dur pentatonika", base: [0, 2, 4, 7, 9], nps: 2 },
  { id: "blues", name: "Blues", base: [0, 3, 5, 7, 10], extra: [6], nps: 2 },
  { id: "majblues", name: "Dur blues", base: [0, 2, 4, 7, 9], extra: [3], nps: 2 },
  { id: "major", name: "Dur (jonska)", base: [0, 2, 4, 5, 7, 9, 11], nps: 3 },
  { id: "minor", name: "Naravni mol", base: [0, 2, 3, 5, 7, 8, 10], nps: 3 },
  { id: "harm", name: "Harmonični mol", base: [0, 2, 3, 5, 7, 8, 11], nps: 3 },
  { id: "dorian", name: "Dorska", base: [0, 2, 3, 5, 7, 9, 10], nps: 3 },
  { id: "mixo", name: "Miksolidijska", base: [0, 2, 4, 5, 7, 9, 10], nps: 3 },
  { id: "phryg", name: "Frigijska", base: [0, 1, 3, 5, 7, 8, 10], nps: 3 },
  { id: "lyd", name: "Lidijska", base: [0, 2, 4, 6, 7, 9, 11], nps: 3, sharp4: true },
];

export const scaleById = (id: string) => SCALES.find((s) => s.id === id) ?? SCALES[0];
export const mod12 = (n: number) => ((n % 12) + 12) % 12;
export const intLabel = (iv: number, sc: Scale) => (iv === 6 && sc.sharp4 ? "#4" : INTERVALS[iv]);

export type Cell = [string: number, fret: number];
export type Position = { k: number; start: number; end: number; cells: Cell[] };

// Položaj k: začni na nizki E pri k-ti stopnji osnove, na vsaki struni vzemi
// `nps` zaporednih tonov lestvice in nadaljuj na naslednji struni s prvim
// višjim tonom — da klasične pentatonične bokse (2 na struno) in 3-na-struno
// položaje 7-tonskih lestvic. Razvrščeni po prečki, a številčenje začne pri
// položaju z osnovnim tonom na nizki E (kot "boks 1" pri pentatoniki).
export function positionsOf(root: number, sc: Scale): Position[] {
  const out: Position[] = [];
  for (let k = 0; k < sc.base.length; k++) {
    let f0 = 0;
    while (mod12(OPEN[0] + f0 - root) !== sc.base[k]) f0++;
    let p = OPEN[0] + f0;
    const cells: Cell[] = [];
    for (let s = 0; s < 6; s++) {
      let taken = 0;
      while (taken < sc.nps) {
        if (p - OPEN[s] >= 0 && sc.base.includes(mod12(p - root))) {
          cells.push([s, p - OPEN[s]]);
          taken++;
        }
        p++;
      }
    }
    if (sc.extra) {
      for (let s = 0; s < 6; s++) {
        const frets = cells.filter((c) => c[0] === s).map((c) => c[1]);
        for (let f = Math.min(...frets); f <= Math.max(...frets); f++) {
          if (sc.extra.includes(mod12(OPEN[s] + f - root))) cells.push([s, f]);
        }
      }
    }
    const frets = cells.map((c) => c[1]);
    if (Math.max(...frets) <= FRETS) out.push({ k, start: Math.min(...frets), end: Math.max(...frets), cells });
  }
  out.sort((a, b) => a.start - b.start);
  const first = Math.max(0, out.findIndex((p) => p.k === 0));
  return [...out.slice(first), ...out.slice(0, first)];
}

// ---- Tonaliteta iz akordov ----

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

// Toni akorda (trozvok, + mala septima pri "7"), bas po "/" ni upoštevan.
export function chordTones(name: string): { root: number; minor: boolean; tones: number[] } | null {
  const m = name.match(/^([A-H])([#b♯♭]?)(.*)$/);
  if (!m) return null;
  const root = mod12(LETTER[m[1]] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0));
  const rest = m[3].split("/")[0];
  const dim = /^(dim|°|m7b5|ø)/.test(rest);
  const minor = dim || (/^m(?!aj)/.test(rest) && !/^maj/.test(rest));
  const power = /^5/.test(rest);
  const third = power ? null : /sus2/.test(rest) ? 2 : /sus4?/.test(rest) ? 5 : minor ? 3 : 4;
  const fifth = dim ? 6 : /aug|\+/.test(rest) ? 8 : 7;
  const tones = [root, mod12(root + fifth)];
  if (third != null) tones.push(mod12(root + third));
  if (/^(m)?7|^9|^11|^13/.test(rest)) tones.push(mod12(root + 10));
  if (/maj7/.test(rest)) tones.push(mod12(root + 11));
  return { root, minor, tones };
}

export type SongKey = { tonic: number; minor: boolean };
export const keyName = (k: SongKey) => `${NAMES[k.tonic]} ${k.minor ? "mol" : "dur"}`;

// Durova tonaliteta: I ii iii IV V vi (vii° izpuščen); molova je ista kot
// njena vzporedna dur (+3) plus V dur (harmonični mol) in IV dur (dorski).
const MAJOR_DEGREES: [number, boolean][] = [
  [0, false], [2, true], [4, true], [5, false], [7, false], [9, true],
];
const MINOR_DEGREES: [number, boolean][] = [
  [0, true], [3, false], [5, true], [7, true], [8, false], [10, false], [7, false], [5, false],
];

// Vseh 24 tonalitet ocenjenih po akordih skladbe (po vrsti, s ponovitvami):
// akord na stopnji tonalitete +1, tonika +1 več, prvi akord tonika +1,5,
// zadnji +2. Vrne najboljšo.
export function detectKey(chords: string[]): SongKey | null {
  const parsed = chords.map(chordTones).filter((c): c is NonNullable<typeof c> => c != null);
  if (!parsed.length) return null;
  let best: { key: SongKey; score: number } | null = null;
  for (const minor of [false, true]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const degrees = minor ? MINOR_DEGREES : MAJOR_DEGREES;
      let score = 0;
      for (const c of parsed) {
        if (degrees.some(([d, mi]) => mod12(tonic + d) === c.root && mi === c.minor)) score += 1;
        if (c.root === tonic && c.minor === minor) score += 1;
      }
      const first = parsed[0];
      const last = parsed[parsed.length - 1];
      if (first.root === tonic && first.minor === minor) score += 1.5;
      if (last.root === tonic && last.minor === minor) score += 2;
      if (!best || score > best.score) best = { key: { tonic, minor }, score };
    }
  }
  return best?.key ?? null;
}

// Delež tonov akordov skladbe (po pojavitvah), ki so v lestvici.
export function scaleFit(chords: string[], root: number, sc: Scale): number {
  const set = new Set([...sc.base, ...(sc.extra ?? [])].map((iv) => mod12(root + iv)));
  let all = 0;
  let inside = 0;
  for (const name of chords) {
    const c = chordTones(name);
    if (!c) continue;
    for (const t of c.tones) {
      all++;
      if (set.has(t)) inside++;
    }
  }
  return all ? inside / all : 0;
}

export type ImproOption = { id: string; root: number; scale: Scale; note?: string; fit: number };
export type ImproGroup = { label: string; options: ImproOption[] };

// Predlogi lestvic za improvizacijo v tonaliteti, po skupinah; znotraj skupine
// po ujemanju s toni akordov skladbe.
export function improGroups(key: SongKey, chords: string[]): ImproGroup[] {
  const t = key.tonic;
  const opt = (root: number, id: string, note?: string): ImproOption => {
    const scale = scaleById(id);
    return { id: `${root}:${id}`, root: mod12(root), scale, note, fit: scaleFit(chords, mod12(root), scale) };
  };
  const rel = key.minor ? mod12(t + 3) : mod12(t + 9);
  const groups: ImproGroup[] = key.minor
    ? [
        {
          label: "Pentatonike in blues",
          options: [opt(t, "minpent"), opt(t, "blues"), opt(rel, "majpent", `isti toni kot ${NAMES[t]} mol pentatonika`)],
        },
        {
          label: "Molove lestvice in modusi",
          options: [opt(t, "minor", "eolska"), opt(t, "dorian"), opt(t, "harm"), opt(t, "phryg")],
        },
        { label: "Vzporedna dur", options: [opt(rel, "major", `isti toni kot ${NAMES[t]} naravni mol`)] },
      ]
    : [
        {
          label: "Pentatonike in blues",
          options: [
            opt(t, "majpent"),
            opt(t, "majblues"),
            opt(rel, "minpent", `isti toni kot ${NAMES[t]} dur pentatonika`),
            opt(t, "minpent", "rock/blues prizvok"),
            opt(t, "blues", "rock/blues prizvok"),
          ],
        },
        { label: "Durove lestvice in modusi", options: [opt(t, "major"), opt(t, "mixo"), opt(t, "lyd")] },
        { label: "Vzporedni mol", options: [opt(rel, "minor", `isti toni kot ${NAMES[t]} dur`)] },
      ];
  // Po ujemanju (na cel odstotek), ob izenačenju po zgornjem vrstnem redu.
  for (const g of groups) g.options.sort((a, b) => Math.round(b.fit * 100) - Math.round(a.fit * 100));
  return groups;
}
