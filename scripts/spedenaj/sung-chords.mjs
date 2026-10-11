// Skill "podcrtaj-akorde" (.claude/skills/podcrtaj-akorde/SKILL.md): natapka
// akorde v ZAPETIH vrsticah (kitice, refreni, zapeti interludiji) in vklopi
// podčrtavanje (synced_chords.sungUnderline).
//
//   node --env-file=.env.local scripts/spedenaj/sung-chords.mjs <id> --audio a.json [--write]
//
// Čas akorda: ocena iz časa vrstice (synced_lines ali sprotna LRC poravnava
// kot v aplikaciji) × delež znakov besedila pred akordom → pripet na mrežo
// polovic taktov iz audio.py (± 1 polje), kjer se kromagram najbolje ujema z
// akordom (upošteva capo). Šibko ujemanje → ostane ocena (javljeno).
// Akordi, ki so že natapkani (intro, solo …), ostanejo. Deli dobijo ime po
// oznaki v tabu (Verse 1, Chorus 2 …); obstoječi del z istim imenom se dopolni.
// Akord petja na istem udarcu kot že natapkan akord (Em na "alone" + prvi Em
// interludija) ostane ob istem času — oba se obarvata hkrati.
// Brez --write samo izpiše. Preverjenih skladb ne spreminja.

import { createJiti } from "jiti";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
globalThis.window ??= { localStorage: { getItem: () => null, setItem: () => {} } };
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { parseChords, splitDescription, transposeChord, findCapo } = await jiti.import("../../src/lib/chords.ts");
const { remapLines, lineKey, fetchLrcCandidates, pickBestCandidate, alignLyrics } = await jiti.import("../../src/lib/syncedLyrics.ts");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Manjka NEXT_PUBLIC_SUPABASE_URL ali SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const ID = process.argv[2];
if (!ID || !arg("--audio")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 14).join("\n"));
  process.exit(1);
}
const write = process.argv.includes("--write");
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

const [s] = await (await fetch(`${url}/rest/v1/songs?id=eq.${ID}&select=*`, { headers: H })).json();
if (!s) throw new Error("Ni skladbe " + ID);
if (s.verified_player_at) throw new Error(`"${s.title}" je preverjena — skill je ne spreminja.`);
const audio = JSON.parse(readFileSync(arg("--audio"), "utf8"));
const video = s.preferred_video_id;
if (!video) throw new Error("Skladba nima zaklenjenega videa (preferred_video_id) — najprej spedenaj.");
if (audio.videoId !== video) throw new Error(`Analiza je za ${audio.videoId}, zaklenjen video je ${video}.`);
if (s.synced_chords?.videoId && s.synced_chords.videoId !== video) throw new Error(`Natapkani akordi so za drug video (${s.synced_chords.videoId}).`);

const { description, body } = splitDescription(parseChords(s.chords_text ?? ""));
const capo = findCapo(description) ?? 0;
const half = audio.bar / 2;
const slotT = (k) => audio.downbeat + k * half;
const slotOf = (t) => Math.round((t - audio.downbeat) / half);

// Razpon vsake zapete vrstice (v času videa).
const offset = s.lrc_offsets?.[video] ?? 0;
const spans = new Map();
const addSpan = (line, t, end) => {
  const q = spans.get(line);
  spans.set(line, q ? { line, t: Math.min(q.t, t), end: Math.max(q.end, end) } : { line, t, end });
};
let source;
if (s.synced_lines?.points?.length) {
  for (const p of remapLines(s.synced_lines.points, body).points) addSpan(p.line, p.t + offset, (p.end ?? p.t + 4) + offset);
  source = "shranjeni časi (synced_lines)";
} else {
  const cands = await fetchLrcCandidates(s.id, s.title, s.author);
  const c = cands.length ? pickBestCandidate(cands, audio.duration, body) : null;
  if (!c) throw new Error("Ni časov vrstic (ne synced_lines ne LRC) — akordov petja ni mogoče oceniti.");
  for (const p of alignLyrics(c.lines, body).points) addSpan(p.lineIndex, p.time + offset, p.end + offset);
  source = `LRCLIB "${c.album}"`;
}

// Kromagram: ujemanje akorda (v tonaliteti posnetka = + capo) s polovico takta.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
function vec(name) {
  const m = name.replace(/\*+$/, "").match(/^([A-H])([#b]?)(m(?!aj))?([^/]*)/);
  if (!m) return null;
  const root = (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  const ints = [0, m[3] ? 3 : 4, 7];
  if (/maj7/.test(m[4])) ints.push(11);
  else if (/7/.test(m[4])) ints.push(10);
  if (/^5$/.test(m[4])) ints.splice(1, 1);
  if (/sus4?/.test(m[4])) ints.splice(1, 1, 5);
  const v = Array(12).fill(0);
  ints.forEach((i) => (v[(root + i) % 12] = 1));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const score = (name, k) => {
  const h = audio.halfBars[k];
  const v = vec(transposeChord(name, capo));
  return h && v ? v.reduce((a, x, i) => a + x * h.chroma[i], 0) : 0;
};

// Že natapkano (časi v času videa) in sekcija vsake vrstice.
const sections = (s.synced_chords?.sections ?? []).map((x) => ({ ...x, points: [...x.points] }));
const tapped = new Set(sections.flatMap((x) => x.points.map((p) => `${p.line}:${p.chord}`)));
const usedSlot = new Map(); // k → { section, index }
sections.forEach((x) => x.points.forEach((p, i) => usedSlot.set(slotOf(p.t + (x.offset ?? 0)), { x, i })));
let label = null;
const sectionOf = body.map((l) => (l.kind === "section" ? (label = l.label) : label));

const added = {};
const weak = [];
const collisions = [];
let lastK = -1;
let lastT = -Infinity;
// Okno iskanja: ± ~1,2 s (pri hitrih mrežah več polj).
const W = Math.max(1, Math.round(1.2 / half));
for (const p of [...spans.values()].sort((a, b) => a.t - b.t)) {
  const l = body[p.line];
  if (l?.kind !== "pair") continue;
  const total = l.chunks.reduce((a, c) => a + c.lyric.length, 0) || 1;
  let before = 0;
  l.chunks.forEach((c, j) => {
    const frac = before / total;
    before += c.lyric.length;
    if (!c.chord || tapped.has(`${p.line}:${j}`)) return;
    const est = p.t + (p.end - p.t) * frac;
    const k0 = slotOf(est);
    let best = null;
    for (let k = k0 - W; k <= k0 + W; k++) {
      if (k <= lastK || slotT(k) <= lastT + 0.05) continue;
      const sc = score(c.chord, k) - Math.abs(k - (est - audio.downbeat) / half) * 0.05;
      if (!best || sc > best.sc) best = { k, sc };
    }
    let t;
    if (!best || best.sc < 0.45) {
      // Zvok ne potrdi: ocena, a vedno za prejšnjim akordom.
      t = r2(Math.max(est, lastT + Math.min(0.3, half / 2)));
      lastT = t;
      weak.push(`${sectionOf[p.line]} · "${c.chord}" v vrstici ${p.line} pri ${fmt(t)} (ocena, zvok ne potrdi)`);
    } else {
      lastK = best.k;
      t = r2(slotT(best.k));
      lastT = t;
      if (best.sc < 0.6) weak.push(`${sectionOf[p.line]} · "${c.chord}" v vrstici ${p.line} pri ${fmt(t)} (ujemanje ${r2(best.sc)})`);
      const hit = usedSlot.get(best.k);
      if (hit) {
        // Isti udarec že ima natapkan akord drugega dela (npr. Em na "alone" =
        // prvi Em interludija): oba ostaneta ob istem času — aplikacija ju
        // obarva hkrati (chordsAt), nato gre naprej na naslednji akord.
        const q = hit.x.points[hit.i];
        collisions.push(`${sectionOf[p.line]} "${c.chord}" in ${hit.x.name} (vrstica ${q.line}) ob ${fmt(t)} — obarvata se hkrati`);
      }
      usedSlot.set(best.k, null);
    }
    const name = sectionOf[p.line] ?? "Petje";
    (added[name] ??= []).push({ t, line: p.line, chord: j, key: lineKey(l), name: c.chord });
  });
}

for (const [name, pts] of Object.entries(added)) {
  let sec = sections.find((x) => x.name === name);
  if (!sec) sections.push((sec = { id: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`, name, offset: 0, end: null, points: [] }));
  for (const p of pts) sec.points.push({ t: r2(p.t - (sec.offset ?? 0)), line: p.line, chord: p.chord, key: p.key });
  sec.points.sort((a, b) => a.t - b.t);
}
// Konec vsakega dopolnjenega dela: naslednji akord v skladbi (sicer 2 polji po zadnjem).
const allStarts = sections.flatMap((x) => x.points.map((p) => p.t + (x.offset ?? 0))).sort((a, b) => a - b);
for (const name of Object.keys(added)) {
  const sec = sections.find((x) => x.name === name);
  const last = sec.points.at(-1).t + (sec.offset ?? 0);
  const next = allStarts.find((t) => t > last + 0.01);
  sec.end = r2(Math.min(next ?? Infinity, last + 2 * half) - (sec.offset ?? 0));
}

console.log(`# ${s.title} — ${s.author} | video ${video} | časi vrstic: ${source} | capo ${capo} | takt ${audio.bar} s`);
for (const [name, pts] of Object.entries(added))
  console.log(`${name}: ${pts.length} akordov  ${pts.map((p) => `${p.name}@${fmt(p.t)}`).join(" ")}`);
console.log(`Šibko ujemanje (preveri v aplikaciji): ${weak.length ? "\n  " + weak.join("\n  ") : "nobeno"}`);
console.log(`Prekrivanja z natapkanimi deli: ${collisions.length ? "\n  " + collisions.join("\n  ") : "nobeno"}`);
const next = { ...(s.synced_chords ?? {}), videoId: video, sections, sungUnderline: true };
if (!write) console.log(`\n(poskusno — za zapis dodaj --write)`);
else {
  mkdirSync(`${root}backups/spedenaj`, { recursive: true });
  const bk = `${root}backups/spedenaj/${s.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(bk, JSON.stringify(s, null, 1), "utf8");
  const res = await fetch(`${url}/rest/v1/songs?id=eq.${s.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ synced_chords: next }) });
  if (!res.ok) throw new Error(await res.text());
  console.log(`\nzapisano (synced_chords, podčrtavanje vklopljeno); prejšnje stanje: ${bk}`);
}
