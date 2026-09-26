// Parser UG markupa akordov (songs.chords_text) za ChordsViewer.tsx.
// UG zapis: vrstica akordov nad vrstico besedila, vsak akord v
// [ch]Am[/ch], pari vrstic ograjeni z [tab]…[/tab] (samo za postavitev —
// tu jih ignoriramo), sekcije kot samostojna vrstica "[Verse 1]".

export type ChordsLine =
  | { kind: "section"; label: string }
  // Vrstica samih akordov: col = stolpec (znak) nad besedilom spodaj.
  | { kind: "chords"; chords: { col: number; name: string }[] }
  // Vrstica akordov + besedilo pod njo, razrezano na kose: vsak akord je
  // pripet na znak besedila, nad katerim stoji (kos = akord + besedilo do
  // naslednjega akorda). Izris kot bloki drži akord nad zlogom tudi ob
  // transpoziciji (daljše ime razmakne besedilo) in pri prelomu vrstice.
  | { kind: "pair"; chunks: { chord: string | null; lyric: string }[] }
  // Besedilo, lahko z vmesnimi akordi (npr. "[Intro] F C/E ... (Hold …)").
  | { kind: "text"; segments: ({ chord: string } | { text: string })[] };

const CHORD_RE = /\[ch\](.*?)\[\/ch\]/g;
const SECTION_RE = /^\[([^\]]+)\]$/;

export function parseChords(content: string): ChordsLine[] {
  const lines = content.replace(/\[\/?tab\]/g, "").replace(/\r\n/g, "\n").split("\n").map(parseLine);
  const out: ChordsLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const lyric =
      next?.kind === "text" && next.segments.every((s) => "text" in s)
        ? next.segments.map((s) => ("text" in s ? s.text : "")).join("")
        : null;
    if (line.kind === "chords" && lyric && lyric.trim()) {
      out.push({ kind: "pair", chunks: pairChunks(line.chords, lyric) });
      i++;
    } else out.push(line);
  }
  return out;
}

// Opis na začetku UG zapisa (naslov, album, avtor transkripcije, opombe …) —
// vse pred prvo sekcijo ali prvo vrstico z akordi — ločeno od pesmi.
export function splitDescription(lines: ChordsLine[]): { description: ChordsLine[]; body: ChordsLine[] } {
  let start = lines.findIndex((l) => l.kind !== "text");
  if (start === -1) start = 0;
  const isBlank = (l: ChordsLine) => l.kind === "text" && l.segments.every((s) => "text" in s && !s.text.trim());
  const description = lines.slice(0, start);
  while (description.length && isBlank(description[description.length - 1])) description.pop();
  while (description.length && isBlank(description[0])) description.shift();
  return { description, body: lines.slice(start) };
}

// Capo iz opisa: "Capo: 2", "Capo 3", "capo on 1st fret", "put on a capo 3rd fret".
export function findCapo(lines: ChordsLine[]): number | null {
  for (const l of lines) {
    if (l.kind !== "text") continue;
    const text = l.segments.map((s) => ("text" in s ? s.text : s.chord)).join("");
    if (/no capo/i.test(text)) continue;
    const m = text.match(/capo\D{0,15}?(\d{1,2})/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function pairChunks(chords: { col: number; name: string }[], lyric: string) {
  const chunks: { chord: string | null; lyric: string }[] = [];
  if (chords[0].col > 0) chunks.push({ chord: null, lyric: lyric.slice(0, chords[0].col) });
  chords.forEach((c, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].col : undefined;
    chunks.push({ chord: c.name, lyric: lyric.slice(c.col, end) });
  });
  return chunks;
}

function parseLine(line: string): ChordsLine {
  const trimmed = line.trim();
  const section = trimmed.match(SECTION_RE);
  if (section && !trimmed.startsWith("[ch]")) return { kind: "section", label: section[1] };

  const segments: ({ chord: string } | { text: string })[] = [];
  let last = 0;
  for (const m of line.matchAll(CHORD_RE)) {
    if (m.index > last) segments.push({ text: line.slice(last, m.index) });
    segments.push({ chord: m[1] });
    last = m.index + m[0].length;
  }
  if (last < line.length) segments.push({ text: line.slice(last) });

  const hasChord = segments.some((s) => "chord" in s);
  const onlySpaces = segments.every((s) => "chord" in s || !s.text.trim());
  if (hasChord && onlySpaces) {
    const chords: { col: number; name: string }[] = [];
    let col = 0;
    for (const s of segments) {
      if ("chord" in s) {
        chords.push({ col, name: s.chord });
        col += s.chord.length;
      } else col += s.text.length;
    }
    return { kind: "chords", chords };
  }
  return { kind: "text", segments };
}

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Za naravne tone: najpogostejši zapis v kitarskih akordih.
const DEFAULT = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11, "B#": 0,
};

function transposeNote(note: string, semitones: number): string {
  const idx = NOTE_INDEX[note];
  if (idx === undefined) return note;
  const next = (((idx + semitones) % 12) + 12) % 12;
  // Ohrani "okus" izvirnika: b ostane b, # ostane #.
  const table = note.endsWith("b") ? FLATS : note.endsWith("#") ? SHARPS : DEFAULT;
  return table[next];
}

// "Bbm7/F" + 2 → "Cm7/G". Neprepoznan zapis (npr. "N.C.") ostane nespremenjen.
export function transposeChord(name: string, semitones: number): string {
  if (semitones % 12 === 0) return name;
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return name;
  let [, root, rest] = m;
  root = transposeNote(root, semitones);
  const bass = rest.match(/^(.*)\/([A-G][#b]?)$/);
  if (bass) rest = `${bass[1]}/${transposeNote(bass[2], semitones)}`;
  return root + rest;
}

// Poenostavitev (kot "Simplify chords" na UG): ostane samo osnovni durov/
// molov (ali zmanjšan/zvečan) akord — D7 → D, Am7 → Am, Cmaj7 → C,
// Dsus4 → D, Bbm/Db → Bbm. Neprepoznan zapis ostane nespremenjen.
export function simplifyChord(name: string): string {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return name;
  const [, root, full] = m;
  const rest = full.replace(/\/[A-G][#b]?$/, "");
  if (/^(maj|M)/.test(rest)) return root;
  if (/^(m|min|-)/.test(rest)) return `${root}m`;
  if (/^(dim|°)/.test(rest)) return `${root}dim`;
  if (/^(aug|\+)/.test(rest)) return `${root}aug`;
  return root;
}

// Transponirana vrstica akordov kot [presledki pred akordom, ime] — vsak
// akord ostane v svojem stolpcu nad besedilom; če se prejšnje ime podaljša
// (A → Bb), se naslednji zamakne, a ostane vsaj en presledek vmes.
export function layoutChordLine(
  chords: { col: number; name: string }[],
  display: (name: string) => string,
): { pad: number; name: string }[] {
  let end = 0;
  return chords.map((c, i) => {
    const name = display(c.name);
    const col = i === 0 ? c.col : Math.max(c.col, end + 1);
    const pad = col - end;
    end = col + name.length;
    return { pad, name };
  });
}
