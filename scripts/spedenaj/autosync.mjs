// Skill "spedenaj" — prototip samodejnih časov vrstic za skladbe brez LRC:
// besede, ki jih je Whisper prepoznal v izločenem vokalu (vocals.py), poravna
// z besedami vrstic taba (Needleman–Wunsch, podobnost besed po Levenshteinu,
// vedno samo naprej) in iz tega izračuna začetek/konec vsake zapete vrstice.
//
//   node --env-file=.env.local scripts/spedenaj/autosync.mjs <songId> --words w.json[,w2.json] [--out lines.json] [--chords-from backup.json]
//
// Več datotek besed: druga (drugi prehod vocals.py --clips) zamenja besede prve znotraj svojih izrezov.
// Poročilo na koncu predlaga --clips za drugi prehod (deli z neujetimi vrsticami).
//
// Izpiše poročilo (vrstica, čas, delež ujetih besed, kaj je Whisper slišal) in
// v --out zapiše { video, lines: [{ line, t, end, conf }] } — to gre v patch
// za song.mjs write kot "linesFrom".

import { createJiti } from "jiti";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
globalThis.window ??= { localStorage: { getItem: () => null, setItem: () => {} } };
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { parseChords, splitDescription } = await jiti.import("../../src/lib/chords.ts");
const { lineKey } = await jiti.import("../../src/lib/syncedLyrics.ts");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const id = process.argv[2];
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const r3 = (x) => Math.round(x * 1000) / 1000;

const res = await fetch(`${url}/rest/v1/songs?id=eq.${id}&select=id,title,author,chords_text`, { headers });
const [song] = await res.json();
if (!song) throw new Error(`Ni skladbe ${id}`);
// --chords-from <backup.json>: besedilo iz varnostne kopije (backups/spedenaj) namesto iz baze — za preizkus.
if (arg("--chords-from")) song.chords_text = JSON.parse(readFileSync(arg("--chords-from"), "utf8")).chords_text;
const body = splitDescription(parseChords(song.chords_text ?? "")).body;
// Prvi prehod + drugi prehodi (izrezi): besede drugega znotraj izrezov zamenjajo besede prvega.
const [rec, ...extra] = arg("--words")
  .split(",")
  .map((f) => JSON.parse(readFileSync(f, "utf8")));
for (const x of extra) {
  const c = x.clips ?? [];
  const inClip = (t) => c.some((_, k) => k % 2 === 0 && t >= c[k] && t < (c[k + 1] ?? Infinity));
  rec.words = [...rec.words.filter((w) => !inClip(w.start)), ...x.words].sort((a, b) => a.start - b.start);
}

// Besede kot lineKey (male črke, brez šumnikov in ločil).
const norm = (w) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Zaporedje besed taba (samo vrstice z besedilom), vsaka s svojo vrstico.
const tab = [];
const lyricLines = [];
body.forEach((line, i) => {
  const k = lineKey(line);
  if (!k || k.startsWith("ch:")) return;
  const ws = k.split(" ").filter(Boolean);
  lyricLines.push({ line: i, words: ws, text: k });
  ws.forEach((w, n) => tab.push({ w, line: i, n }));
});
const heard = rec.words.map((x) => ({ ...x, n: norm(x.w) })).filter((x) => x.n);
// Stisnjene besede: Whisper včasih več besed prilepi na skoraj isti čas (Premau: "premau si znal, premau
// za dve" vse ob 24,3 s). Časi teh besed so napačni, zato v poravnavi štejejo malo — sicer je pri
// enakih ponovitvah refrena poravnava raje preskočila pravo vrstico (18,4 s) in vse zamaknila za eno.
const DENSE_SEC = 0.12;
heard.forEach((h, j) => {
  h.dense = heard.filter((x, k) => k !== j && Math.abs(x.start - h.start) < DENSE_SEC).length >= 2;
});

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

// Poravnava: ujemanje +2·(podobnost−0,5) (pod 0,5 je kazen), preskok besede −0,3.
const GAP = -0.3;
const A = tab.length;
const B = heard.length;
const S = Array.from({ length: A + 1 }, () => new Float64Array(B + 1));
const P = Array.from({ length: A + 1 }, () => new Uint8Array(B + 1));
for (let i = 1; i <= A; i++) (S[i][0] = i * GAP), (P[i][0] = 1);
for (let j = 1; j <= B; j++) (S[0][j] = j * GAP), (P[0][j] = 2);
for (let i = 1; i <= A; i++)
  for (let j = 1; j <= B; j++) {
    const m = S[i - 1][j - 1] + 2 * (sim(tab[i - 1].w, heard[j - 1].n) - 0.5) * (heard[j - 1].dense ? 0.2 : 1);
    const u = S[i - 1][j] + GAP;
    const l = S[i][j - 1] + GAP;
    if (m >= u && m >= l) (S[i][j] = m), (P[i][j] = 0);
    else if (u >= l) (S[i][j] = u), (P[i][j] = 1);
    else (S[i][j] = l), (P[i][j] = 2);
  }
const match = new Array(A).fill(-1);
for (let i = A, j = B; i > 0 || j > 0; ) {
  if (i > 0 && j > 0 && P[i][j] === 0) {
    if (sim(tab[i - 1].w, heard[j - 1].n) >= 0.5) match[i - 1] = j - 1;
    i--, j--;
  } else if (i > 0 && (j === 0 || P[i][j] === 1)) i--;
  else j--;
}

// Časi vrstic: prvi/zadnji ujeti besedi, popravljeno za neujete besede na robu (~0,3 s/besedo).
const PER_WORD = 0.3;
const out = lyricLines.map((L) => {
  const hits = tab.map((x, k) => ({ x, k })).filter(({ x, k }) => x.line === L.line && match[k] >= 0);
  if (!hits.length) return { ...L, t: null, end: null, conf: 0, heard: "" };
  const first = hits[0];
  const last = hits[hits.length - 1];
  const t = heard[match[first.k]].start - first.x.n * PER_WORD;
  const end = heard[match[last.k]].end + (L.words.length - 1 - last.x.n) * PER_WORD;
  const span = heard.slice(match[first.k], match[last.k] + 1).map((h) => h.w).join(" ");
  return { ...L, t: Math.max(0, t), end, conf: hits.length / L.words.length, heard: span };
});

// Zanesljivost: vsaj 50 % besed in ne hitreje kot 0,25 s/besedo od prejšnje zanesljive vrstice
// (Whisper pri ponovitvah refrena izpusti besede, ostanek pa prilepi prezgodaj).
const MIN_CONF = 0.5;
const MIN_SEC_PER_WORD = 0.25;
for (const o of out) if (o.conf < MIN_CONF) (o.t = null), (o.end = null);
{
  let prev = -1;
  for (let k = 0; k < out.length; k++) {
    if (out[k].t == null) continue;
    if (prev >= 0) {
      const ws = out.slice(prev, k).reduce((n, o) => n + o.words.length, 0);
      if (out[k].t < out[prev].t + ws * MIN_SEC_PER_WORD) {
        out[k].t = out[k].end = null;
        continue;
      }
    }
    prev = k;
  }
}
const sureBefore = out.map((o) => o.t != null);

// Vzorec iz istega dela: neujete vrstice za zanesljivo vrstico p dobijo razmike, kot jih imajo iste
// vrstice (enako besedilo) za drugo zanesljivo ponovitev q (npr. 1. refren po 2. refrenu).
for (let k = 1; k < out.length; k++) {
  if (out[k].t != null || out[k - 1].t == null || out[k - 1].fromPattern != null) continue;
  let b = k;
  while (b < out.length && out[b].t == null) b++;
  const p = k - 1;
  for (let q = 0; q < out.length; q++) {
    if (q === p || out[q].text !== out[p].text || !sureBefore[q]) continue;
    let ok = true;
    for (let m = k; m < b && ok; m++) {
      const r = q + (m - p);
      ok = r < out.length && sureBefore[r] && out[r].text === out[m].text;
    }
    if (!ok) continue;
    for (let m = k; m < b; m++) {
      const r = q + (m - p);
      out[m].t = out[p].t + (out[r].t - out[q].t);
      out[m].end = out[p].t + (out[r].end - out[q].t);
      out[m].fromPattern = q;
    }
    break;
  }
  k = b;
}
for (let k = 0; k < out.length; k++) {
  if (out[k].t != null) continue;
  let a = k - 1;
  while (a >= 0 && out[a].t == null) a--;
  let b = k;
  while (b < out.length && out[b].t == null) b++;
  const from = a >= 0 ? out[a].end : 0;
  const to = b < out.length ? out[b].t : (rec.duration ?? from + 4 * (b - a));
  const n = b - a - 1;
  for (let m = a + 1; m < b; m++) {
    const step = (to - from) / n;
    out[m].t = from + (m - a - 1) * step;
    out[m].end = out[m].t + step * 0.9;
    out[m].guess = true;
  }
  k = b;
}
// Samo naprej in konec pred naslednjo vrstico.
for (let k = 0; k < out.length; k++) {
  if (k > 0 && out[k].t <= out[k - 1].t) out[k].t = out[k - 1].t + 0.2;
  const next = out[k + 1]?.t;
  if (next != null && out[k].end > next) out[k].end = next;
  if (out[k].end <= out[k].t) out[k].end = out[k].t + 0.5;
}

console.log(`# ${song.title} — ${song.author}: ${heard.length} prepoznanih besed, ${lyricLines.length} zapetih vrstic`);
for (const o of out) {
  const flag = o.guess ? "?? ocena" : o.fromPattern != null ? `≈vz.${out[o.fromPattern].line}` : o.conf < 0.7 ? "?" : "";
  console.log(
    `${String(o.line).padStart(3)} ${fmt(o.t)}–${fmt(o.end)} ${String(Math.round(o.conf * 100)).padStart(3)} % ${flag.padEnd(8)} ${o.text}\n` +
      `${" ".repeat(36)}slišano: ${o.heard || "—"}`,
  );
}
// Opozorila, ki jih "100 %" skrije: enake ponovitve refrena se vedno ujemajo 100 %, tudi ko so zamaknjene
// za eno vrstico. Sumljivo: prekratka vrstica, prekrivanje/potisk naprej, neporabljene slišane besede
// (≥ 3 zaporedne), ki so podobne sosednji vrstici — tam je poravnava morda preskočila pravo ponovitev.
const warn = [];
const used = new Set(match.filter((j) => j >= 0));
for (let k = 0; k < out.length; k++) {
  const o = out[k];
  if (o.end - o.t < o.words.length * 0.15) warn.push(`vrstica ${o.line} ${fmt(o.t)}: samo ${(o.end - o.t).toFixed(2)} s za ${o.words.length} besed`);
  if (k > 0 && o.t < out[k - 1].end - 0.05) warn.push(`vrstica ${o.line} ${fmt(o.t)}: začne pred koncem prejšnje`);
}
for (let j = 0; j < heard.length; ) {
  if (used.has(j)) {
    j++;
    continue;
  }
  let b = j;
  while (b < heard.length && !used.has(b)) b++;
  if (b - j >= 3) {
    const run = heard.slice(j, b).map((h) => h.n).join(" ");
    const said = `"${heard.slice(j, b).map((h) => h.w).join(" ")}"`;
    const near = out.filter((o) => Math.abs(o.t - heard[j].start) < 8);
    const like = near.find((o) => sim(o.text.replace(/ /g, ""), run.replace(/ /g, "")) >= 0.6);
    // Ponovitev, ki je tab nima (Jaz sem izvisel, 2026-10-21: vsak refren se poje dvakrat, zapisan je
    // enkrat): neporabljeno petje vsebuje besedilo kakšne vrstice kjerkoli v skladbi.
    const runJoined = run.replace(/ /g, "");
    const anywhere = out.find((o) => o.words.length >= 3 && runJoined.includes(o.text.replace(/ /g, "").slice(0, 12)) && sim(o.text.replace(/ /g, ""), runJoined.slice(0, o.text.replace(/ /g, "").length + 2)) >= 0.6);
    if (like) warn.push(`${fmt(heard[j].start)}: neporabljeno ${said} ≈ vrstica ${like.line} — sosednje vrstice so morda zamaknjene`);
    else if (anywhere)
      warn.push(`${fmt(heard[j].start)}: neporabljeno ${said} = besedilo vrstice ${anywhere.line} — tu se poje ponovitev, ki je tab nima? (izpiši jo)`);
  }
  j = b;
}
// Predolga vrstica: zadnja ujeta beseda je daleč pred naslednjo vrstico — vmes se poje nekaj, česar tab
// nima (ponovljen refren) ali je tam instrumental. Preveri v w.json.
for (let k = 0; k < out.length - 1; k++) {
  const o = out[k];
  const gap = out[k + 1].t - o.t;
  if (!o.guess && gap > Math.max(8, o.words.length * 1.2))
    warn.push(`vrstica ${o.line} ${fmt(o.t)}: do naslednje vrstice ${gap.toFixed(1)} s za ${o.words.length} besed — ponovitev, ki je tab nima, ali instrumental?`);
}
if (warn.length) console.log(`\n⚠ preveri (ritem/kromagram):\n  ${warn.join("\n  ")}`);
const sure = out.filter((o) => !o.guess && o.fromPattern == null).length;
const pattern = out.filter((o) => o.fromPattern != null).length;
console.log(`\nzanesljivo: ${sure}/${out.length}, po vzorcu: ${pattern}, ocenjeno: ${out.length - sure - pattern}`);
// Predlog za drugi prehod: od konca zadnje zanesljive vrstice do začetka naslednje.
const clips = [];
for (let k = 0; k < out.length; k++) {
  if (!out[k].guess) continue;
  let b = k;
  while (b < out.length && out[b].guess) b++;
  const from = k > 0 ? out[k - 1].end : 0;
  const to = b < out.length ? out[b].t : (rec.duration ?? out[b - 1].end);
  clips.push(`${Math.max(0, from - 0.5).toFixed(1)}-${(to + 0.5).toFixed(1)}`);
  k = b;
}
if (clips.length) console.log(`drugi prehod: vocals.py <video> --vocals v.wav --clips ${clips.join(",")}`);
if (arg("--out")) {
  writeFileSync(
    arg("--out"),
    JSON.stringify({ video: rec.videoId, lines: out.map((o) => ({ line: o.line, t: r3(o.t), end: r3(o.end), conf: r3(o.conf), guess: !!o.guess })) }, null, 1),
  );
  console.log(`→ ${arg("--out")}`);
}
