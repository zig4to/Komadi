// Parser UG markupa akordov (songs.chords_text) za ChordsViewer.tsx.
// UG zapis: vrstica akordov nad vrstico besedila, vsak akord v
// [ch]Am[/ch], pari vrstic ograjeni z [tab]…[/tab] (samo za postavitev —
// tu jih ignoriramo), sekcije kot samostojna vrstica "[Verse 1]".

export type ChordsLine =
  // tabLabel: kratek naslov iz besedila nad tablaturo ("Solo") — ne začne pesmi.
  | { kind: "section"; label: string; tabLabel?: true }
  // Vrstica samih akordov: col = stolpec (znak) nad besedilom spodaj.
  | { kind: "chords"; chords: { col: number; name: string }[] }
  // Vrstica akordov + besedilo pod njo, razrezano na kose: vsak akord je
  // pripet na znak besedila, nad katerim stoji (kos = akord + besedilo do
  // naslednjega akorda). Izris kot bloki drži akord nad zlogom tudi ob
  // transpoziciji (daljše ime razmakne besedilo) in pri prelomu vrstice.
  | { kind: "pair"; chunks: { chord: string | null; lyric: string }[] }
  // Besedilo, lahko z vmesnimi akordi (npr. "[Intro] F C/E ... (Hold …)").
  | { kind: "text"; segments: ({ chord: string } | { text: string })[] }
  // Tablatura: zaporedne vrstice strun ("e|--5--|"), izrisane kot celota brez
  // preloma (široke se pomikajo vodoravno), z morebitno vrstico akordov nad njimi.
  | { kind: "tab"; header: { col: number; name: string }[] | null; lines: string[] };

const CHORD_RE = /\[ch\](.*?)\[\/ch\]/g;
const SECTION_RE = /^\[([^\]]+)\]$/;
// Razdelek brez oglatih oklepajev ("Intro", "Verse 1:", "Chorus x2", "Refren
// (2x)") — samo ime razdelka v svoji vrstici, sicer bi npr. "Intro" pred prvo
// vrstico akordov obtičal v opisu.
const PLAIN_SECTION_RE =
  /^(intro|verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|outro|solo|interlude|instrumental|riff|hook|coda|break|ending|refren|kitica|uvod|most|zaključek|refrain|strofa)(\s*\d+)?(\s*x\s*\d+|\s*\d+\s*x)?\s*:?\s*(\([^)]*\))?$/i;
// Samostojno ime akorda (za vrstico akordov nad tablaturo, zapisano brez [ch]).
const CHORD_TOKEN_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|M|\+|°|\d|\(|\)|#|b)*(\/[A-G][#b]?)?$/;

const lineText = (l: ChordsLine) =>
  l.kind === "text" ? l.segments.map((s) => ("text" in s ? s.text : s.chord)).join("") : "";

// Ime strune na začetku vrstice tablature (H = B v slovenskem/nemškem zapisu).
const STRING_NAME = "[A-Ha-h][#b]?";
const NAMED_STAFF_RE = new RegExp(`^\\s*${STRING_NAME}\\s*[|:-]`);

// Vrstica strun: "e|--5--|", "Eb|---7~---| x4", "G-14-14~--|", "|--0--|" — večinoma pomišljaji.
function isTabStaff(l: ChordsLine) {
  if (l.kind !== "text") return false;
  // UG včasih ime strune označi kot akord ("[ch]G[/ch]|---"): dovoljeno samo to.
  if (l.segments.some((s, i) => "chord" in s && (i > 0 || !/^[A-H][#b]?$/.test(s.chord)))) return false;
  const t = lineText(l).trim();
  const dashes = (t.match(/-/g) ?? []).length;
  const ratio = dashes / t.replace(/\s/g, "").length;
  // Ime strune + "|" je dovolj zanesljivo tudi za kratko vrstico ("G|-1---|").
  if (new RegExp(`^${STRING_NAME}\\s*[|:]`).test(t)) return dashes >= 3 && ratio >= 0.25;
  // Brez "|" za imenom ("G-14h15-x-14~---|"): zaključni "|" dopušča več številk.
  if (new RegExp(`^${STRING_NAME}\\s*-`).test(t)) return t.endsWith("|") ? dashes >= 4 && ratio >= 0.15 : dashes >= 6 && ratio >= 0.3;
  return /^[|:]?-/.test(t) && dashes >= 6 && ratio >= 0.4;
}

// Štetje dob nad tablaturo ("1 + 2 + 3 + 4 +", "   1   2   3   4", "  .   .") —
// del tablature, skrito skupaj z njo.
function isCountLine(l: ChordsLine | undefined) {
  if (!l || l.kind !== "text" || l.segments.some((s) => "chord" in s)) return false;
  const t = lineText(l);
  return /^[\s\d+.&]+$/.test(t) && /[\d.]/.test(t);
}

// Kratek naslov tik nad tablaturo ("Solo", "Riff:", "Chords:") — postane sekcija,
// da ima svoj gumb "Tab".
function tabLabel(l: ChordsLine | undefined) {
  if (!l || l.kind !== "text" || l.segments.some((s) => "chord" in s)) return null;
  const t = lineText(l).trim();
  return /^[\p{L} ]{2,20}:?$/u.test(t) ? t.replace(/:$/, "") : null;
}

function isNamedStaff(line: string) {
  return NAMED_STAFF_RE.test(line);
}

// Vrstica nad tablaturo, ki jo pripnemo k njej: vrstica [ch] akordov ali
// besedilo iz samih imen akordov ("      B        F#m").
function tabHeader(l: ChordsLine | undefined): { col: number; name: string }[] | null {
  if (!l) return null;
  if (l.kind === "chords") return l.chords;
  if (l.kind !== "text") return null;
  // [ch] akordi v oklepajih: "  ([ch]C[/ch])     ([ch]G[/ch])".
  if (l.segments.some((s) => "chord" in s)) {
    if (!l.segments.every((s) => "chord" in s || /^[\s()]*$/.test(s.text))) return null;
    const chords: { col: number; name: string }[] = [];
    let col = 0;
    for (const s of l.segments) {
      if ("chord" in s) chords.push({ col, name: s.chord });
      col += "chord" in s ? s.chord.length : s.text.length;
    }
    return chords;
  }
  // Tudi akordi v oklepajih ("(C)   (G)"): ime brez oklepajev, en stolpec desno.
  const tokens = [...lineText(l).matchAll(/\(?(\S+?)\)?(?=\s|$)/g)];
  if (!tokens.length || !tokens.every((m) => CHORD_TOKEN_RE.test(m[1]))) return null;
  return tokens.map((m) => ({ col: m.index + (m[0].startsWith("(") ? 1 : 0), name: m[1] }));
}

export function parseChords(content: string): ChordsLine[] {
  const parsed = content.replace(/\[\/?tab\]/g, "").replace(/\r\n/g, "\n").split("\n").map(parseLine);
  // Najprej tablature, da vrstica akordov nad njimi ne postane par z besedilom.
  const lines: ChordsLine[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (!isTabStaff(parsed[i])) {
      lines.push(parsed[i]);
      continue;
    }
    const staff: string[] = [];
    while (i < parsed.length && isTabStaff(parsed[i])) staff.push(lineText(parsed[i++]).replace(/\s+$/, ""));
    i--;
    while (isCountLine(lines[lines.length - 1])) staff.unshift(lineText(lines.pop()!).replace(/\s+$/, ""));
    const header = tabHeader(lines[lines.length - 1]);
    if (header) lines.pop();
    const label = tabLabel(lines[lines.length - 1]);
    if (label) lines[lines.length - 1] = { kind: "section", label, tabLabel: true };
    lines.push({ kind: "tab", header, lines: staff });
  }
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

// Urejanje v aplikaciji (gumb "Uredi" v ChordsViewer.tsx): UG zapis ↔ navadno
// besedilo "akordi nad besedilom", brez [ch]/[tab] oznak.
export function toEditableText(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\[\/?tab\]/g, "").replace(CHORD_RE, "$1");
}

// Akord v vrstici, ki jo je napisal uporabnik (H = B v slovenskem zapisu, "C*").
const EDIT_CHORD_RE = /^[A-H][#b]?(m|maj|min|dim|aug|sus|add|M|\+|°|\d|\(|\)|#|b)*(\/[A-H][#b]?)?\*?$/;
// Okraski, ki smejo stati v vrstici akordov: "x2", "2x", "-", "/", "%", "N.C.", "...".
const CHORD_LINE_DECOR_RE = /^(x\d+|\d+x|-+|\/|%|N\.C\.?|\.{2,}|\*+|:)$/i;
// Kosi vrstice akordov: vse razen presledkov, "|", "(" in ")" (takti, oklepaji).
const CHORD_PIECE_RE = /[^\s|()]+/g;

// Ena vrstica iz urejevalnika v UG zapis: vrstica iz samih akordov (in
// okraskov) dobi [ch] oznake na istih stolpcih; razdelki, tablature in
// besedilo ostanejo, kot so.
function editedLineToUg(line: string): string {
  if (SECTION_RE.test(line.trim()) || isTabStaff(parseLine(line))) return line;
  // Oznaka razdelka na začetku vrstice ("[Intro] F C/E") ostane.
  const prefix = line.match(/^\s*\[[^\]]*\]/)?.[0] ?? "";
  const rest = line.slice(prefix.length);
  const pieces = rest.match(CHORD_PIECE_RE) ?? [];
  if (!pieces.some((p) => EDIT_CHORD_RE.test(p))) return line;
  if (!pieces.every((p) => EDIT_CHORD_RE.test(p) || CHORD_LINE_DECOR_RE.test(p))) return line;
  return prefix + rest.replace(CHORD_PIECE_RE, (p) => (EDIT_CHORD_RE.test(p) ? `[ch]${p}[/ch]` : p));
}

// Shrani urejeno besedilo: vrstice, ki jih uporabnik ni spremenil (LCS
// primerjava z izvirnikom), ostanejo točno take kot v UG zapisu — [ch] v
// diagramih, taktih, sredi besedila … se ne izgubijo; pretvorijo se samo nove
// ali spremenjene vrstice.
export function applyEditedText(original: string, edited: string): string {
  const ug = original.replace(/\r\n/g, "\n").split("\n");
  const plain = toEditableText(original).split("\n");
  const next = edited.replace(/\r\n/g, "\n").split("\n");
  const n = plain.length;
  const m = next.length;
  // lcs[i][j] = dolžina najdaljšega skupnega podzaporedja plain[i..], next[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = plain[i] === next[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && plain[i] === next[j]) {
      out.push(ug[i]);
      i++;
      j++;
    } else if (i < n && lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else out.push(editedLineToUg(next[j++]));
  }
  return out.join("\n");
}

// Opis na začetku UG zapisa (naslov, album, avtor transkripcije, opombe …) —
// vse pred prvo sekcijo ali prvo vrstico z akordi — ločeno od pesmi.
// Tablatura začne pesem le, če ima imena strun; črta iz pomišljajev
// ("------------......" pod naslovom) ostane v opisu.
export function splitDescription(lines: ChordsLine[]): { description: ChordsLine[]; body: ChordsLine[] } {
  let start = lines.findIndex(
    (l) =>
      (l.kind === "section" && !l.tabLabel) ||
      l.kind === "chords" ||
      l.kind === "pair" ||
      (l.kind === "tab" && (l.header !== null || l.lines.some(isNamedStaff))),
  );
  if (start === -1) start = 0;
  // Naslov tablature ("Picking") gre skupaj s tablaturo v pesem.
  const prev = lines[start - 1];
  if (prev?.kind === "section" && prev.tabLabel) start--;
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
  if (PLAIN_SECTION_RE.test(trimmed)) return { kind: "section", label: trimmed.replace(/\s*:$/, "") };

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
