// "Pametni predvajalnik" v ChordsViewer.tsx: časovno usklajeno besedilo (LRC)
// iz odprte baze LRCLIB (lrclib.net, dovoli klice iz brskalnika) in poravnava
// njegovih vrstic z vrsticami v songs.chords_text, da akordi med predvajanjem
// YouTube videa sledijo petju.

import type { ChordsLine } from "@/lib/chords";

export type LrcLine = { time: number; text: string };
// Ena različica posnetka iz LRCLIB (album, dolžina v sekundah, vrstice).
export type LrcCandidate = { album: string; duration: number; lines: LrcLine[] };

// "[01:02.13] Went down to Geisha Minah" → { time: 62.13, text: "…" }. Prazne
// vrstice (začetek instrumentalnega dela) ostanejo s text "" — označujejo
// konec prejšnje vrstice (črta pod vrstico je takrat polna).
export function parseLrc(text: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) out.push({ time: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() });
  }
  return out;
}

// Okrajšave izvajalcev v knjižnici, ki jih LRCLIB ne pozna.
const ARTIST_ALIAS: Record<string, string> = { CCR: "Creedence Clearwater Revival" };

const cacheKey = (songId: string) => `komadi:chords:lrc:${songId}`;

// Vse različice s časi (največ 8) — katero uporabiti, se odloči šele, ko je
// znana dolžina YouTube videa (pickCandidate). Rezultat, tudi prazen, gre v
// localStorage, da se LRCLIB ne kliče ob vsakem odprtju — skupaj z naslovom
// in izvajalcem, ker po popravku zapisa (npr. "Papparazzi" → "Paparazzi")
// stari (prazen) rezultat ne velja več.
export async function fetchLrcCandidates(songId: string, title: string, author: string): Promise<LrcCandidate[]> {
  // "v2": od takrat so v shrambi tudi prazne vrstice (konci vrstic).
  const query = `v2\n${title}\n${author}`;
  try {
    const cached = window.localStorage.getItem(cacheKey(songId));
    if (cached) {
      const parsed = JSON.parse(cached) as { query?: string; candidates?: LrcCandidate[] };
      if (parsed.query === query && parsed.candidates) return parsed.candidates;
    }
  } catch {}
  const q = new URLSearchParams({ track_name: title, artist_name: ARTIST_ALIAS[author] ?? author });
  const res = await fetch(`https://lrclib.net/api/search?${q}`);
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  const data = (await res.json()) as { albumName?: string; duration?: number; syncedLyrics?: string | null }[];
  const candidates = data
    .filter((d) => d.syncedLyrics)
    .slice(0, 8)
    .map((d) => ({ album: d.albumName ?? "", duration: d.duration ?? 0, lines: parseLrc(d.syncedLyrics!) }))
    .filter((c) => c.lines.some((l) => l.text));
  try {
    window.localStorage.setItem(cacheKey(songId), JSON.stringify({ query, candidates }));
  } catch {}
  return candidates;
}

// Različica z dolžino, najbližjo YouTube videu (brez dolžine: prva, LRCLIB
// jih razvrsti po ujemanju).
export function pickCandidate(candidates: LrcCandidate[], videoDuration: number): LrcCandidate | null {
  if (!candidates.length) return null;
  if (!videoDuration) return candidates[0];
  return candidates.reduce((best, c) =>
    Math.abs(c.duration - videoDuration) < Math.abs(best.duration - videoDuration) ? c : best,
  );
}

// Primerjava besedila: male črke, brez diakritike in ločil ("Moët" = "moet",
// UG zapis "Mo&euml;t" prav tako).
function words(text: string): string[] {
  return text
    .replace(/&(\w)\w*;/g, "$1")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    // Zlogi z vezajem v akordih ("Guaran-teed", "Extra-ordinarily") in
    // opuščaj ("She's", "don't") = ena beseda.
    .replace(/(\p{L})[-'’](\p{L})/gu, "$1$2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    // Enočrkovne ("a", "i") ne povedo nič o tem, katera vrstica je prava.
    .filter((w) => w.length > 1);
}

// Ista beseda tudi ob drugačni končnici ("gelatin" / "gelatine").
const sameWord = (x: string, y: string) =>
  x === y || (Math.min(x.length, y.length) >= 5 && (x.startsWith(y) || y.startsWith(x)));

// Podobnost vrstice LRC (a) in vrstice pesmi (b), 0 … 1: delež skupnih besed
// (Dice), ali — ker je v akordih več kratkih vrstic LRC pogosto v eni daljši
// ("Killer Queen, gunpowder, gelatine,") — delež besed LRC, ki so v b.
function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const rest = [...b];
  let common = 0;
  for (const w of a) {
    const i = rest.findIndex((r) => sameWord(w, r));
    if (i >= 0) {
      common++;
      rest.splice(i, 1);
    }
  }
  const dice = (2 * common) / (a.length + b.length);
  const contained = a.length >= 2 ? (0.9 * common) / a.length : 0;
  return Math.max(dice, contained);
}

// Besedilo vrstice pesmi (samo vrstice z besedilom; akordi, tablature in
// razdelki ne).
function lineLyric(line: ChordsLine): string | null {
  if (line.kind === "pair") return line.chunks.map((c) => c.lyric).join("");
  if (line.kind === "text" && line.segments.every((s) => "text" in s)) {
    const t = line.segments.map((s) => ("text" in s ? s.text : "")).join("");
    return t.trim() ? t : null;
  }
  return null;
}

// time = začetek vrstice LRC, end = začetek naslednje (tudi prazne) vrstice LRC.
export type SyncPoint = { time: number; end: number; lineIndex: number };

// Vsaki vrstici LRC poišče vrstico pesmi (indeks v body): najprej od
// pravkar povezane naprej (do 20 vrstic — ista vrstica je dovoljena, ker je v
// akordih več kratkih vrstic LRC pogosto v eni), sicer kjerkoli (refren, ki je
// v akordih napisan enkrat, se v LRC ponovi). Brez dobrega ujemanja LRC
// vrstica ne premakne.
export function alignLyrics(lrc: LrcLine[], body: ChordsLine[]): { points: SyncPoint[]; matched: number } {
  const lyricLines = body
    .map((l, i) => ({ index: i, words: words(lineLyric(l) ?? "") }))
    .filter((l) => l.words.length > 0);
  const points: SyncPoint[] = [];
  let pos = 0;
  let matched = 0;
  const lrcWords = lrc.map((l) => words(l.text));
  // Skok drugam (npr. nazaj na refren) velja le, če se naslednja vrstica LRC
  // ujema z eno od naslednjih vrstic za tem mestom — sicer bi npr. zadnji
  // "Wanna try?" (ki ga v zadnjem refrenu akordov ni) ob koncu skladbe pomaknil
  // nazaj na prvi refren.
  const confirmed = (k: number, j: number) => {
    const next = lrcWords.slice(k + 1).find((w) => w.length);
    if (!next) return false;
    return lyricLines.slice(j + 1, j + 4).some((l) => similarity(next, l.words) >= 0.5);
  };
  for (let k = 0; k < lrc.length; k++) {
    const line = lrc[k];
    const w = lrcWords[k];
    if (!w.length) continue;
    let best = -1;
    let bestScore = 0;
    // Tudi do 6 vrstic nazaj: refren, ki ga pevec ponovi, v akordih pa je na
    // tem mestu zapisan enkrat ("Rekla je nemorem" ×2 v Sam prjatla), naj ostane
    // tu — ne skoči na isto besedilo v naslednjem refrenu nižje in ne preskoči
    // kitice. Dlje ko je vrstica (naprej ali nazaj), manj je verjetna.
    for (let j = Math.max(0, pos - 6); j < Math.min(lyricLines.length, pos + 20); j++) {
      const distance = j >= pos ? (j - pos) * 0.02 : (pos - j) * 0.03;
      const score = similarity(w, lyricLines[j].words) - distance;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (bestScore < 0.4) {
      for (let j = 0; j < lyricLines.length; j++) {
        const score = similarity(w, lyricLines[j].words);
        if (score > bestScore + 0.1 && score >= 0.6 && confirmed(k, j)) {
          bestScore = score;
          best = j;
        }
      }
    }
    if (best < 0 || bestScore < 0.4) continue;
    matched++;
    pos = best;
    points.push({ time: line.time, end: lrc[k + 1]?.time ?? line.time + 5, lineIndex: lyricLines[best].index });
  }
  return { points, matched };
}

// Indeksi vrstic telesa pesmi, ki imajo besedilo — po njih teče snemanje
// časov ("Posnemi čase" v ChordsViewer.tsx).
export function lyricLineIndexes(body: ChordsLine[]): number[] {
  return body.flatMap((l, i) => (lineLyric(l) ? [i] : []));
}

// Vrstice, po katerih teče tapkanje: z besedilom in instrumentalne (samo
// akordi, npr. "| Fm | Bbm |" v introu ali solu). Razdelki in tablature ne.
export function recordableLineIndexes(body: ChordsLine[]): number[] {
  return body.flatMap((l, i) =>
    lineLyric(l) || l.kind === "chords" || (l.kind === "text" && l.segments.some((s) => "chord" in s)) ? [i] : [],
  );
}

// Razdelek, ki je instrumentalen po imenu (Intro, Solo, Outro, Uvod …).
const INSTRUMENTAL_RE = /intro|solo|interlude|instrument|outro|riff|break|bridge|uvod|vmes|kitar|coda|ending/i;

// Instrumentalni deli med petjem (za besedilo iz LRCLIB): pred prvo zapeto
// vrstico (intro) in v premorih — prazna vrstica LRC (konec petja), ki ji
// naslednja zapeta sledi šele čez ≥ MIN_GAP s — označi razdelek z
// instrumentalnim imenom, ki v akordih stoji med okoliškima povezanima
// vrsticama, sicer prvo vrstico samih akordov vmes. Vrne dodatne točke.
const MIN_GAP = 6;
export function instrumentalPoints(points: SyncPoint[], lrc: LrcLine[], body: ChordsLine[]): SyncPoint[] {
  if (!points.length) return [];
  const isChordLine = (l: ChordsLine) =>
    l.kind === "chords" || (l.kind === "text" && !lineLyric(l) && l.segments.some((s) => "chord" in s));
  const isInstrumentalSection = (l: ChordsLine) => l.kind === "section" && INSTRUMENTAL_RE.test(l.label);
  // Najprej instrumentalni razdelek v [from, to), sicer prva vrstica akordov
  // (za intro: prva vrstica akordov pred prvo zapeto).
  const findTarget = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (isInstrumentalSection(body[i])) return i;
    for (let i = from; i < to; i++) if (isChordLine(body[i])) return i;
    return -1;
  };
  const extra: SyncPoint[] = [];
  const first = points[0];
  if (first.time >= MIN_GAP / 2) {
    const target = findTarget(0, first.lineIndex);
    if (target >= 0) extra.push({ time: 0, end: first.time, lineIndex: target });
  }
  for (let k = 0; k < lrc.length; k++) {
    if (lrc[k].text.trim()) continue;
    const start = lrc[k].time;
    const nextSung = lrc.slice(k + 1).find((l) => l.text.trim());
    if (!nextSung || nextSung.time - start < MIN_GAP) continue;
    // Okoliški povezani vrstici (zadnja pred premorom, prva po njem).
    const prev = [...points].reverse().find((p) => p.time < start);
    const next = points.find((p) => p.time >= nextSung.time);
    if (!prev || !next) continue;
    // Naslednja zapeta vrstica je nižje: iščemo vmes. Sicer (skok nazaj na
    // refren, zapisan enkrat) samo instrumentalni razdelek do 15 vrstic nižje.
    const target =
      next.lineIndex > prev.lineIndex
        ? findTarget(prev.lineIndex + 1, next.lineIndex)
        : (() => {
            for (let i = prev.lineIndex + 1; i < Math.min(body.length, prev.lineIndex + 16); i++)
              if (isInstrumentalSection(body[i])) return i;
            return -1;
          })();
    if (target >= 0) extra.push({ time: start, end: nextSung.time, lineIndex: target });
  }
  return extra;
}

// Ročno posneti časi (songs.synced_lines) v isto obliko kot alignLyrics.
export function manualSyncPoints(points: { t: number; line: number }[]): SyncPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  return sorted.map((p, k) => ({ time: p.t, end: sorted[k + 1]?.t ?? p.t + 5, lineIndex: p.line }));
}

// Deli z akordi (synced_chords.sections) v en časovno urejen seznam točk:
// vsak čas + zamik dela, na koncu dela "stop" (Konec ali 4 s po zadnjem).
const SECTION_TAIL = 4;
export function flattenChordSections(
  sections: { offset: number; end: number | null; points: { t: number; line: number; chord: number }[] }[],
): ({ t: number; line: number; chord: number } | { t: number; stop: true })[] {
  const out: ({ t: number; line: number; chord: number } | { t: number; stop: true })[] = [];
  for (const s of sections) {
    if (!s.points.length) continue;
    const pts = [...s.points].sort((a, b) => a.t - b.t);
    for (const p of pts) out.push({ ...p, t: p.t + s.offset });
    const last = pts[pts.length - 1].t;
    out.push({ t: (s.end != null && s.end > last ? s.end : last + SECTION_TAIL) + s.offset, stop: true });
  }
  return out.sort((a, b) => a.t - b.t);
}

// Akord, ki je ob danem času obarvan (ročno posneti synced_chords): zadnja
// točka s t ≤ time; točka "stop" ali čas pred prvo = null. points po času.
export function chordAt(
  points: ({ t: number; line: number; chord: number } | { t: number; stop: true })[],
  time: number,
): { line: number; chord: number } | null {
  let lo = 0;
  let hi = points.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= time) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const p = points[idx];
  return !p || "stop" in p ? null : { line: p.line, chord: p.chord };
}

// Vrstica pesmi za dani čas (zadnja točka, ki se je že začela; pred prvo -1)
// in koliko je je že odpetega (0 … 1) — za črto pod vrstico. Več zaporednih
// vrstic LRC v isti vrstici pesmi je en razpon: od prve do konca zadnje.
export function lineProgressAt(points: SyncPoint[], time: number): { lineIndex: number; progress: number } {
  let lo = 0;
  let hi = points.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time <= time) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return { lineIndex: -1, progress: 0 };
  const lineIndex = points[idx].lineIndex;
  let first = idx;
  while (first > 0 && points[first - 1].lineIndex === lineIndex) first--;
  let last = idx;
  while (last + 1 < points.length && points[last + 1].lineIndex === lineIndex) last++;
  const start = points[first].time;
  const span = Math.max(0.1, points[last].end - start);
  return { lineIndex, progress: Math.min(1, Math.max(0, (time - start) / span)) };
}
