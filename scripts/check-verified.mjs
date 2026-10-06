// Varovalka za preverjene skladbe ("Predvajalnik preverjen"): iz zamrznjenih
// časov (synced_lines, synced_chords, lrc_offsets) izračuna, kaj predvajalnik
// pokaže vsakih 0,1 s — označena vrstica, vrstica, na katero se med solom že
// pomakne pogled, obarvan akord (desktop in telefon) — z ISTIMI funkcijami kot
// ChordsViewer.tsx (applyTiming), in primerja s shranjenim posnetkom.
//
//   node --env-file=.env.local scripts/check-verified.mjs          primerjaj
//   node --env-file=.env.local scripts/check-verified.mjs --save   shrani posnetek
//
// Zaženi pred vsako spremembo v src/lib/syncedLyrics.ts, src/lib/chords.ts ali
// logiki predvajanja v ChordsViewer.tsx (shrani na stari kodi, primerjaj na novi).
// Razlika = sprememba bi vplivala na preverjeno skladbo. Izhodna koda 1 ob razliki.
// Ne zajame samega pomikanja pogleda (Sam Špili, drsenje) — to je treba omeniti posebej.

import { createJiti } from "jiti";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const BASELINE = fileURLToPath(new URL("./verified-baseline.json", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { parseChords, splitDescription } = await jiti.import("../src/lib/chords.ts");
const { remapLines, manualSyncPoints, lineProgressAt, instrumentalGapAt, flattenChordSections, chordAt } =
  await jiti.import("../src/lib/syncedLyrics.ts");

// Kot SS_GAP_MIN v ChordsViewer.tsx.
const GAP_MIN = 4;
const STEP = 0.1;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Manjka NEXT_PUBLIC_SUPABASE_URL ali SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
const res = await fetch(
  `${url}/rest/v1/songs?verified_player_at=not.is.null&select=id,title,author,chords_text,synced_lines,synced_chords,lrc_offsets&order=title`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
const songs = await res.json();

// Časovnica ene skladbe: spremembe stanja { t, line, ahead, chord, chordPhone, … }.
function timeline(song) {
  const body = splitDescription(parseChords(song.chords_text ?? "")).body;
  const lines = song.synced_lines;
  const issues = [];
  if (!lines?.frozen) issues.push("ni zamrznjena (časi se še računajo iz LRCLIB)");
  let points = [];
  if (lines?.points?.length) {
    const r = remapLines(lines.points, body);
    if (!r.ok) issues.push("kakšne vrstice ni več najti (remapLines ok = false)");
    if (r.changed) issues.push("številke vrstic so se premaknile (remapLines)");
    points = manualSyncPoints(r.points);
  }
  const offset = (lines?.videoId && song.lrc_offsets?.[lines.videoId]) || 0;
  const sections = (song.synced_chords?.sections ?? []).map((s) => ({ ...s, points: remapLines(s.points, body).points }));
  const chordDesk = flattenChordSections(sections, false);
  const chordPhone = flattenChordSections(sections, true);
  const lastT = Math.max(0, ...points.map((p) => p.end), ...chordDesk.map((p) => p.t), ...chordPhone.map((p) => p.t)) + 5;
  const changes = [];
  let prev = "";
  for (let i = 0; i * STEP <= lastT; i++) {
    const t = Math.round(i * STEP * 10) / 10;
    // Kot applyTiming v ChordsViewer.tsx.
    const gap = points.length ? instrumentalGapAt(points, t - offset, GAP_MIN) : null;
    const line = points.length ? (gap ? -1 : lineProgressAt(points, t - offset).lineIndex) : -1;
    const ahead = gap && gap.progress >= 0.5 ? gap.nextLine : -1;
    const cd = chordAt(chordDesk, t);
    const cp = chordAt(chordPhone, t);
    const state = { line, ahead, chord: cd ? `${cd.line}:${cd.chord}` : "", chordPhone: cp ? `${cp.line}:${cp.chord}` : "" };
    const s = JSON.stringify(state);
    if (s !== prev) changes.push({ t, ...state });
    prev = s;
  }
  return { title: `${song.author} - ${song.title}`, issues, changes };
}

const now = Object.fromEntries(songs.map((s) => [s.id, timeline(s)]));
for (const tl of Object.values(now)) for (const i of tl.issues) console.log(`! ${tl.title}: ${i}`);

// process.exitCode namesto process.exit(): exit() takoj po fetch na Windows sproži
// libuv assertion (UV_HANDLE_CLOSING) in izhodno kodo 127.
if (process.argv.includes("--save")) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 1) + "\n");
  console.log(`Shranjeno: ${songs.length} preverjenih skladb → scripts/verified-baseline.json`);
} else if (!existsSync(BASELINE)) {
  console.error("Ni posnetka — najprej zaženi z --save (na kodi, ki še deluje).");
  process.exitCode = 2;
} else {
  process.exitCode = compare(JSON.parse(readFileSync(BASELINE, "utf8")));
}

function compare(base) {
  let diffs = 0;
  for (const [id, tl] of Object.entries(now)) {
    const old = base[id];
    if (!old) {
      console.log(`+ ${tl.title}: nova preverjena skladba (ni v posnetku — zaženi --save)`);
      continue;
    }
    const a = old.changes.map((c) => JSON.stringify(c));
    const b = new Set(tl.changes.map((c) => JSON.stringify(c)));
    const gone = a.filter((x) => !b.has(x));
    const added = [...b].filter((x) => !a.includes(x));
    if (!gone.length && !added.length) continue;
    diffs++;
    console.log(`✗ ${tl.title}: ${gone.length} spremenjenih/izginulih, ${added.length} novih stanj`);
    for (const x of gone.slice(0, 5)) console.log(`   prej ${x}`);
    for (const x of added.slice(0, 5)) console.log(`   zdaj ${x}`);
  }
  for (const id of Object.keys(base)) if (!now[id]) console.log(`- ${base[id].title}: ni več preverjena`);
  console.log(diffs ? `\n${diffs} preverjenih skladb bi se spremenilo.` : `\nOK — ${songs.length} preverjenih skladb nespremenjenih.`);
  return diffs ? 1 : 0;
}
