import type { ChordsLine } from "@/lib/chords";

// "Nasvet" v pregledovalniku akordov: poišče ponavljajoča se zaporedja akordov —
// cela skladba na enem zaporedju (Pumped Up Kicks) ali enako zaporedje v vseh
// kiticah / refrenih … Akordi so prikazani (transpozicija, Simpl, No capo).

export type PatternPart = { label: string; count: number; unit: string[] };
export type ChordPatterns = { whole: string[] | null; parts: PatternPart[]; sameVerseChorus: boolean };

const TYPES: [RegExp, string][] = [
  [/^(pre[- ]?chorus|pred[- ]?refren)/i, "Pred-refren"],
  [/^(chorus|refren|ref\.?)/i, "Refren"],
  [/^(verse|kitica|strofa|vers)/i, "Kitica"],
  [/^(intro|uvod)/i, "Intro"],
  [/^(outro|zaklju)/i, "Outro"],
  [/^(bridge|most)/i, "Bridge"],
  [/^(solo)/i, "Solo"],
  [/^(interlude|instrumental|vmesni)/i, "Interlude"],
];
const typeOf = (label: string) => TYPES.find(([re]) => re.test(label.trim()))?.[1] ?? null;

function chordsOf(line: ChordsLine): string[] {
  if (line.kind === "chords") return line.chords.map((c) => c.name);
  if (line.kind === "pair") return line.chunks.flatMap((c) => (c.chord ? [c.chord] : []));
  if (line.kind === "text") return line.segments.flatMap((s) => ("chord" in s ? [s.chord] : []));
  if (line.kind === "tab") return (line.header ?? []).map((c) => c.name);
  return [];
}

// Najkrajša enota, katere ponavljanje da zaporedje. Ujemanje po prehodih (za
// akordom X pride naslednji akord enote), zato en manjkajoč ali odvečen akord ne
// zamakne vsega za njim (Pumped Up Kicks: v zadnjem refrenu je bil "N.C.").
function unitOf(seq: string[], maxLen = 8): { unit: string[]; share: number } {
  for (let p = 1; p <= Math.min(maxLen, Math.floor(seq.length / 2)); p++) {
    const unit = seq.slice(0, p);
    // Enota z istim akordom dvakrat (Dm Dm) — prehod ni enoličen, ujemanje po položaju.
    const unique = new Set(unit).size === p;
    let ok = 0;
    for (let i = 1; i < seq.length; i++) {
      const expect = unique && unit.includes(seq[i - 1]) ? unit[(unit.indexOf(seq[i - 1]) + 1) % p] : unit[i % p];
      if (seq[i] === expect) ok++;
    }
    const share = ok / Math.max(1, seq.length - 1);
    if (share >= 0.9) return { unit, share };
  }
  return { unit: seq, share: 1 };
}

// Enaki enoti, tudi če se začneta na drugem akordu (rotacija).
function sameCycle(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const s = [...a, ...a].join(" ");
  return ` ${s} `.includes(` ${b.join(" ")} `);
}

export function findChordPatterns(body: ChordsLine[], display: (name: string) => string): ChordPatterns | null {
  const sections: { type: string | null; chords: string[] }[] = [];
  let cur: { type: string | null; chords: string[] } = { type: null, chords: [] };
  for (const line of body) {
    if (line.kind === "section") {
      if (cur.chords.length) sections.push(cur);
      cur = { type: typeOf(line.label), chords: [] };
      continue;
    }
    cur.chords.push(...chordsOf(line).map(display));
  }
  if (cur.chords.length) sections.push(cur);
  const all = sections.flatMap((s) => s.chords);
  if (all.length < 8) return null;

  // Cela skladba na enem zaporedju (do 8 akordov), vsaj 3 ponovitve.
  const w = unitOf(all);
  const whole = w.unit.length < all.length && all.length / w.unit.length >= 3 && new Set(w.unit).size > 1 ? w.unit : null;

  const parts: PatternPart[] = [];
  if (!whole) {
    const byType = new Map<string, string[][]>();
    for (const s of sections) {
      if (!s.type || s.chords.length < 2) continue;
      const u = unitOf(s.chords, 8).unit;
      byType.set(s.type, [...(byType.get(s.type) ?? []), u]);
    }
    for (const [label, units] of byType) {
      const first = units[0];
      if (units.length < 2 && first.length === sections.find((s) => s.type === label)!.chords.length) continue;
      if (!units.every((u) => sameCycle(u, first))) continue;
      // Samo zaporedja (vsaj 2 akorda), ne en sam akord čez cel del.
      if (first.length > 8 || new Set(first).size < 2) continue;
      parts.push({ label, count: units.length, unit: first });
    }
  }
  const v = parts.find((p) => p.label === "Kitica");
  const c = parts.find((p) => p.label === "Refren");
  const sameVerseChorus = !!v && !!c && sameCycle(v.unit, c.unit);
  if (!whole && !parts.length) return null;
  return { whole, parts, sameVerseChorus };
}
