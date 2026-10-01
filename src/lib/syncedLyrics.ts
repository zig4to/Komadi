// "Pametni predvajalnik" v ChordsViewer.tsx: časovno usklajeno besedilo (LRC)
// iz odprte baze LRCLIB (lrclib.net, dovoli klice iz brskalnika) in poravnava
// njegovih vrstic z vrsticami v songs.chords_text, da akordi med predvajanjem
// YouTube videa sledijo petju.

import { parseChords, splitDescription, type ChordsLine } from "@/lib/chords";
import type { Song, SyncedChords, SyncedLines } from "@/types/song";

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

// Različica, ki se najbolje poveže z zapisom akordov (delež povezanih
// vrstic); med tistimi, ki so vsaj 90 % najboljše, tista z dolžino, najbližjo
// videu. Samo po dolžini je včasih zmagala druga skladba ali drugo besedilo z
// naključno podobno dolžino (Born on the Bayou, Colt 45 … 0 % povezanih).
export function pickBestCandidate(candidates: LrcCandidate[], videoDuration: number, body: ChordsLine[]): LrcCandidate | null {
  if (candidates.length <= 1) return candidates[0] ?? null;
  const scored = candidates.map((c) => {
    const total = c.lines.filter((l) => l.text).length;
    return { c, ratio: total ? alignLyrics(c.lines, body).matched / total : 0 };
  });
  const best = Math.max(...scored.map((s) => s.ratio));
  const good = scored.filter((s) => s.ratio >= best * 0.9).map((s) => s.c);
  return pickCandidate(good, videoDuration);
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

// Vsaki vrstici LRC poišče vrstico pesmi (indeks v body). PRAVILO: samo
// naprej — vrstica, ki je že odpeta, se nikoli ne ponovi in nazaj se ne skače.
//
// Razporeditev se izbere za celo skladbo naenkrat (dinamično programiranje:
// največja vsota ujemanj ob pogoju, da gre vrstni red samo naprej), ne sproti
// vrstico za vrstico. Sprotna izbira je zgrešila v obe smeri: ista vrstica,
// zapisana večkrat zapored ("Where is my mind?" ×3), je obstala na prvi
// ponovitvi; uvodni vzklik ali refren, ki je tu zapet, zapisan pa samo nižje,
// je potegnil oznako daleč naprej in preskočil celo kitico ("Come on Eileen").
//
// Na isti vrstici sme ostati le naslednja vrstica LRC, ki se ujema z njenimi
// še NEPORABLJENIMI besedami (več kratkih vrstic LRC v eni dolgi vrstici
// akordov: "Killer Queen, gunpowder, gelatine"); enaka vrstica gre na naslednjo.
// Zapeta vrstica, ki je v tablaturi na tem mestu ni (refren, zapisan enkrat),
// ostane nepovezana — oznaka počaka. Tablatura mora zato imeti vsako zapeto
// vrstico zapisano tolikokrat, kot se poje.
const ALIGN_MIN = 0.4;
// Vsaka preskočena vrstica tablature malo stane (bližnja vrstica ima prednost).
const ALIGN_SKIP = 0.02;
// Največ toliko sekund na besedo pri delitvi ene vrstice LRC na več vrstic akordov.
const WORD_SEC_MAX = 1.2;

export function alignLyrics(lrc: LrcLine[], body: ChordsLine[]): { points: SyncPoint[]; matched: number } {
  const lyricLines = body
    .map((l, i) => ({ index: i, words: words(lineLyric(l) ?? "") }))
    .filter((l) => l.words.length > 0);
  const m = lyricLines.length;
  // Vrstice LRC z besedilom (k = indeks v lrc).
  const sung = lrc.map((l, k) => ({ k, w: words(l.text) })).filter((x) => x.w.length > 0);
  const n = sung.length;
  if (!m || !n) return { points: [], matched: 0 };
  // Besede b brez tistih, ki jih je porabila prejšnja vrstica LRC na isti vrstici.
  const minus = (b: string[], used: string[]) => {
    const rest = [...b];
    for (const x of used) {
      const i = rest.findIndex((r) => sameWord(r, x));
      if (i >= 0) rest.splice(i, 1);
    }
    return rest;
  };
  // Polnilo iz ene ponovljene besede ("Run, run, run, run", "la la la"): delno
  // ujemanje (skupen "run" z "You'd better run, better run") ni dovolj.
  const minScore = sung.map(({ w }) => (w.length >= 3 && new Set(w).size === 1 ? 0.8 : ALIGN_MIN));
  // f[i][j + 1] = najboljša vsota po prvih i vrsticah LRC, ko je zadnja povezana
  // vrstica tablature j (j = -1: še nobena). lastI = katera vrstica LRC je bila
  // zadnja povezana v tem stanju; from = prejšnja vrstica tablature, če je bila
  // i-ta vrstica LRC povezana (sicer -2).
  const NONE = -1e9;
  const f: Float64Array[] = [new Float64Array(m + 1).fill(NONE)];
  f[0][0] = 0;
  const lastI: Int32Array[] = [new Int32Array(m + 1).fill(-1)];
  const from: Int32Array[] = [new Int32Array(m + 1).fill(-2)];
  for (let i = 1; i <= n; i++) {
    const w = sung[i - 1].w;
    const prev = f[i - 1];
    const cur = Float64Array.from(prev);
    const curLast = Int32Array.from(lastI[i - 1]);
    const curFrom = new Int32Array(m + 1).fill(-2);
    for (let j = 0; j < m; j++) {
      let best = NONE;
      let bestFrom = -2;
      // Nova vrstica (od prejšnje j2 < j naprej).
      const fresh = similarity(w, lyricLines[j].words);
      if (fresh >= minScore[i - 1]) {
        for (let j2 = -1; j2 < j; j2++) {
          if (prev[j2 + 1] === NONE) continue;
          const v = prev[j2 + 1] + fresh - (j - j2 - 1) * ALIGN_SKIP;
          if (v > best) {
            best = v;
            bestFrom = j2;
          }
        }
      }
      // Ista vrstica kot prejšnja povezana vrstica LRC: samo z neporabljenimi besedami.
      if (prev[j + 1] !== NONE && lastI[i - 1][j + 1] >= 0) {
        const stay = similarity(w, minus(lyricLines[j].words, sung[lastI[i - 1][j + 1]].w));
        if (stay >= minScore[i - 1] && prev[j + 1] + stay > best) {
          best = prev[j + 1] + stay;
          bestFrom = j;
        }
      }
      if (best > cur[j + 1]) {
        cur[j + 1] = best;
        curLast[j + 1] = i - 1;
        curFrom[j + 1] = bestFrom;
      }
    }
    f.push(cur);
    lastI.push(curLast);
    from.push(curFrom);
  }
  // Najboljši konec in pot nazaj: assigned[i] = vrstica tablature za i-to vrstico LRC (ali -1).
  let j = -1;
  for (let x = 0; x < m; x++) if (f[n][x + 1] > f[n][j + 1]) j = x;
  const assigned = new Int32Array(n).fill(-1);
  for (let i = n; i >= 1 && j >= 0; i--) {
    if (from[i][j + 1] === -2) continue;
    assigned[i - 1] = j;
    j = from[i][j + 1];
  }
  const points: SyncPoint[] = [];
  let matched = 0;
  // Zadnja vrstica tablature, ki že ima oznako (povezana ali porabljena).
  let owned = -1;
  for (let i = 0; i < n; i++) {
    const at = assigned[i];
    if (at < 0) continue;
    matched++;
    const { k, w } = sung[i];
    const line = lrc[k];
    const end = lrc[k + 1]?.time ?? line.time + 5;
    // Čas za delitev vrstice LRC po besedah: največ WORD_SEC_MAX na besedo — do
    // naslednje vrstice LRC je lahko dolg premor ("War is over, now" + 10 s do
    // "Happy Christmas"), ki bi sicer zadnjo vrstico ("Now") zamaknil predaleč.
    const span = Math.min(end - line.time, w.length * WORD_SEC_MAX);
    const timeAt = (wordsBefore: number) => line.time + (span * wordsBefore) / w.length;
    // Vrstice PRED povezano, ki jih pokriva začetek te vrstice LRC ("War is over,
    // if you want it" = "War is over" + "If you want it" v Happy Xmas — povezana
    // je druga, ker se bolje ujema): dobijo začetek vrstice LRC, povezana pa
    // sorazmerni čas. Samo vrstice brez oznake (za `owned`), največ 2 nazaj.
    let rest = minus(w, lyricLines[at].words);
    const lead: number[] = [];
    for (let b = at - 1; b > owned && b >= at - 2; b--) {
      const bw = lyricLines[b].words;
      const hits = bw.filter((x) => rest.some((r) => sameWord(r, x)));
      if (!bw.length || hits.length / bw.length < 0.8) break;
      rest = minus(rest, hits);
      lead.unshift(b);
    }
    let before = 0;
    for (const b of lead) {
      points.push({ time: timeAt(before), end, lineIndex: lyricLines[b].index });
      before += lyricLines[b].words.length;
    }
    points.push({ time: timeAt(before), end, lineIndex: lyricLines[at].index });
    owned = at;
    // Ena vrstica LRC čez več vrstic akordov ("You'd better run, better run, outrun
    // my gun" = "You'd better run, better run" + "Outrun my gun" v Pumped Up
    // Kicks): naslednje vrstice, katerih besede so v preostanku vrstice LRC, se
    // porabijo (oznaka gre nanje ob sorazmernem času) — do vrstice, ki jo ima
    // naslednja povezana vrstica LRC.
    // Vrstica tablature, razdeljena med to in naslednjo vrstico LRC ("Except the
    // little fish, bumped into me" + "I swear he was trying to talk to me" proti
    // "Except the little fish" / "Bumped into me, I swear he was" / "Tryin' to
    // talk to me" v Where Is My Mind?): srednje nima v celoti nobena vrstica
    // LRC, zato šteje, če so njene besede v preostanku te IN v naslednji vrstici
    // LRC (vsaj ena v tej) — sicer ostane brez oznake.
    let limit = m;
    let nextSung: string[] = [];
    for (let i2 = i + 1; i2 < n; i2++) {
      if (assigned[i2] >= 0) {
        limit = assigned[i2];
        if (i2 === i + 1) nextSung = sung[i2].w;
        break;
      }
    }
    let last = at;
    before = w.length - rest.length;
    while (last + 1 < limit && rest.length) {
      const nextWords = lyricLines[last + 1].words;
      const hits = nextWords.filter((x) => rest.some((r) => sameWord(r, x)));
      if (hits.length / nextWords.length < 0.8) {
        const shared = nextWords.filter((x) => rest.some((r) => sameWord(r, x)) || nextSung.some((r) => sameWord(r, x)));
        if (!hits.length || shared.length / nextWords.length < 0.8) break;
      }
      for (const x of hits) {
        const q = rest.findIndex((r) => sameWord(r, x));
        if (q >= 0) rest.splice(q, 1);
      }
      last++;
      points.push({ time: timeAt(before), end, lineIndex: lyricLines[last].index });
      before += hits.length;
    }
    owned = last;
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
// end: shranjen (zamrznjene točke iz LRCLIB — pravi konec vrstice, zato
// premori/instrumentalni deli ostanejo) ali začetek naslednje točke (ročni tapi).
export function manualSyncPoints(points: { t: number; line: number; end?: number }[]): SyncPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  return sorted.map((p, k) => ({ time: p.t, end: p.end ?? sorted[k + 1]?.t ?? p.t + 5, lineIndex: p.line }));
}

// "Prstni odtis" vrstice telesa pesmi: normalizirano besedilo; za vrstice
// samih akordov število akordov (imena se smejo popraviti). Prazno = vrstice
// ni mogoče prepoznati (razdelek, tablatura).
export function lineKey(line: ChordsLine | undefined): string {
  if (!line) return "";
  const lyric = lineLyric(line);
  if (lyric) return words(lyric).join(" ");
  if (line.kind === "chords") return `ch:${line.chords.length}`;
  if (line.kind === "text") {
    const n = line.segments.filter((s) => "chord" in s).length;
    return n ? `ch:${n}` : "";
  }
  return "";
}

// Shranjene točke (vezane na številko vrstice) prestavi na vrstico z istim
// ključem, če se je številka premaknila — po urejanju besedila ali spremembi
// razčlenjevanja (chords.ts). Najprej ista smer premika kot pri prejšnji
// točki, nato najbližja vrstica z istim ključem (±50). Točke brez ključa
// (starejši zapisi) ostanejo. ok = false: kakšne vrstice ni več (spremenjeno
// besedilo) — časi niso več zanesljivi.
export function remapLines<T extends { line: number; key?: string }>(points: T[], body: ChordsLine[]): { points: T[]; ok: boolean; changed: boolean } {
  const keys = body.map((l) => lineKey(l));
  let shift = 0;
  let ok = true;
  let changed = false;
  const out = points.map((p) => {
    if (!p.key) return p;
    const guess = p.line + shift;
    for (let d = 0; d <= 50; d++) {
      for (const j of d ? [guess + d, guess - d] : [guess]) {
        if (keys[j] === p.key) {
          shift = j - p.line;
          if (j === p.line) return p;
          changed = true;
          return { ...p, line: j };
        }
      }
    }
    ok = false;
    return p;
  });
  return { points: out, ok, changed };
}

// Ob shranjevanju urejenega besedila/akordov: shranjeni časi vrstic in akordov
// z novimi številkami vrstic; če katere vrstice ni več, se oznaka "Predvajalnik
// preverjen" umakne. Vrne dodatna polja za update (poleg chords_text).
export function rebaseSyncOnEdit(
  song: Pick<Song, "synced_lines" | "synced_chords" | "verified_player_at">,
  newText: string,
): { synced_lines?: SyncedLines; synced_chords?: SyncedChords; verified_player_at?: null } {
  const body = splitDescription(parseChords(newText)).body;
  const update: { synced_lines?: SyncedLines; synced_chords?: SyncedChords; verified_player_at?: null } = {};
  let ok = true;
  if (song.synced_lines?.points.length) {
    const r = remapLines(song.synced_lines.points, body);
    if (r.changed) update.synced_lines = { ...song.synced_lines, points: r.points };
    ok = ok && r.ok;
  }
  if (song.synced_chords?.sections?.length) {
    let changed = false;
    const sections = song.synced_chords.sections.map((s) => {
      const r = remapLines(s.points, body);
      changed = changed || r.changed;
      ok = ok && r.ok;
      return r.changed ? { ...s, points: r.points } : s;
    });
    if (changed) update.synced_chords = { ...song.synced_chords, sections };
  }
  if (!ok && song.verified_player_at) update.verified_player_at = null;
  return update;
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
// span = trajanje vrstice (s) — napredek raste linearno s časom (1/span na sekundo).
export function lineProgressAt(points: SyncPoint[], time: number): { lineIndex: number; progress: number; span: number } {
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
  if (idx < 0) return { lineIndex: -1, progress: 0, span: 0 };
  const lineIndex = points[idx].lineIndex;
  let first = idx;
  while (first > 0 && points[first - 1].lineIndex === lineIndex) first--;
  let last = idx;
  while (last + 1 < points.length && points[last + 1].lineIndex === lineIndex) last++;
  const start = points[first].time;
  const span = Math.max(0.1, points[last].end - start);
  return { lineIndex, progress: Math.min(1, Math.max(0, (time - start) / span)), span };
}
