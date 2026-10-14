// Skill "spedenaj" (.claude/skills/spedenaj/SKILL.md): branje in pisanje ene
// skladbe iz "Pregled in odobritev" z ISTIMI funkcijami kot aplikacija
// (src/lib/chords.ts, src/lib/syncedLyrics.ts, prek jiti kot check-verified.mjs).
//
//   node --env-file=.env.local scripts/spedenaj/song.mjs list
//   … song.mjs videos <id>                                  kandidati za video (oEmbed: naslov, kanal, vgradnja)
//   … song.mjs editable <id> --out draft.txt                besedilo za urejanje ("akordi nad besedilom")
//   … song.mjs dump <id> [--text draft.txt] [--audio a.json] [--duration s] [--album "LRC album"]
//         vrstice telesa (indeks, vrsta, akordi z indeksom j za synced_chords, lineKey),
//         LRC poravnava (čas → vrstica), LRC vrstice brez para, zapete vrstice brez časa;
//         z --audio še ujemanje akordov taba s posnetkom (tonaliteta, vrstice, ki ne sedejo)
//   … song.mjs write <id> --patch patch.json [--write]      brez --write samo pokaže, kaj bi zapisal
//
// patch.json (vse neobvezno):
//   { "text": "draft.txt",              urejeno besedilo (applyEditedText + rebaseSyncOnEdit)
//     "video": "<videoId>",             preferred_video_id; časi se vežejo nanj
//     "duration": 180.3,                dolžina videa (izbira LRC kandidata)
//     "lrcOffset": 0.25,                lrc_offsets[video]
//     "chordSections": [ { "name": "Intro", "end": 19.3, "points": [ { "t": 0.72, "line": 1, "chord": 0 } ] } ],
//                                       zamenja dele z istim imenom; line/chord = indeksi iz dump (po novem besedilu)
//     "lineOverrides": [ { "line": 43, "t": 105.6, "end": 110.02 } ]
//                                       zapiše synced_lines: LRC poravnava (ali obstoječi ročni časi) + ti popravki
//     "lrcAlbum": "Best Metal Ballads", LRC različica za synced_lines (ko aplikacija po dolžini videa izbere napačno)
//     "saveLines": true                 zapiši synced_lines tudi brez lineOverrides (npr. samo zaradi lrcAlbum)
//   }
// Pred pisanjem shrani staro vrstico v backups/spedenaj/<id>-<čas>.json. Preverjenih
// skladb (verified_player_at) ne spreminja.

import { createJiti } from "jiti";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
// fetchLrcCandidates bere/piše window.localStorage (predpomnilnik v brskalniku).
globalThis.window ??= { localStorage: { getItem: () => null, setItem: () => {} } };
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { parseChords, splitDescription, toEditableText, applyEditedText, transposeChord } = await jiti.import("../../src/lib/chords.ts");
const { fetchLrcCandidates, pickBestCandidate, alignLyrics, lineKey, rebaseSyncOnEdit, remapLines } =
  await jiti.import("../../src/lib/syncedLyrics.ts");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Manjka NEXT_PUBLIC_SUPABASE_URL ali SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const SONG_COLS =
  "id,user_id,title,author,chords_text,youtube_url,youtube_music_url,youtube_embed_ids,preferred_video_id,lrc_offsets,synced_lines,synced_chords,verified_player_at,verified_chords_at,review_pending";

const [cmd, id] = process.argv.slice(2);
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

async function rest(path, init) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...init });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function loadSong(songId) {
  const rows = await rest(`songs?id=eq.${songId}&select=${SONG_COLS}`);
  if (!rows.length) throw new Error(`Ni skladbe ${songId}`);
  return rows[0];
}
const youTubeId = (u) => u?.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null;

// Akordi vrstice z indeksom j, kot ga uporablja renderLine/chordName v ChordsViewer.tsx
// (pair: indeks kosa, tudi kosov brez akorda; text: indeks segmenta; chords/tab: zaporedni).
function chordSlots(line) {
  if (line.kind === "chords") return line.chords.map((c, j) => ({ j, name: c.name }));
  if (line.kind === "tab") return (line.header ?? []).map((c, j) => ({ j, name: c.name }));
  if (line.kind === "pair") return line.chunks.flatMap((c, j) => (c.chord ? [{ j, name: c.chord }] : []));
  if (line.kind === "text") return line.segments.flatMap((s, j) => ("chord" in s ? [{ j, name: s.chord }] : []));
  return [];
}
function lyricOf(line) {
  if (line.kind === "pair") return line.chunks.map((c) => c.lyric).join("").trim();
  if (line.kind === "text" && line.segments.every((s) => "text" in s)) return line.segments.map((s) => s.text).join("").trim();
  return "";
}
function bodyOf(text) {
  return splitDescription(parseChords(text)).body;
}

// LRC: kandidati iz LRCLIB, izbran kot v aplikaciji (pickBestCandidate po dolžini videa).
// album: izbere točno to različico (ko aplikacija po dolžini videa izbere napačno — Dreamer).
async function lrcFor(song, body, duration, album) {
  const cands = await fetchLrcCandidates(song.id, song.title, song.author);
  const byAlbum = album ? cands.find((x) => x.album === album) : null;
  if (album && !byAlbum) throw new Error(`LRC različice "${album}" ni; na voljo: ${cands.map((x) => `"${x.album}" ${x.duration} s`).join(", ")}`);
  const c = byAlbum ?? (cands.length ? pickBestCandidate(cands, duration ?? 0, body) : null);
  return { cands, c, aligned: c ? alignLyrics(c.lines, body) : null };
}

// ---- kromagram: akord iz imena → 12-tonski vektor (koren, terca, kvinta, sedma …)
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
function chordVector(name) {
  const m = name.replace(/\*+$/, "").match(/^([A-H])([#b]?)([^/]*)(?:\/([A-H][#b]?))?$/);
  if (!m) return null;
  const rootPc = (PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  const q = m[3];
  const minor = /^(m(?!aj)|min)/.test(q);
  const ints = new Set([0, minor ? 3 : 4, /dim|°|b5/.test(q) ? 6 : /aug|\+|#5/.test(q) ? 8 : 7]);
  if (/sus/.test(q)) {
    ints.delete(3);
    ints.delete(4);
    ints.add(/sus2/.test(q) ? 2 : 5);
  }
  if (/maj7|M7/.test(q)) ints.add(11);
  else if (/7|9|11|13/.test(q)) ints.add(10);
  if (/6/.test(q) && !/\/6/.test(q)) ints.add(9);
  if (/^5$/.test(q)) ints.delete(minor ? 3 : 4);
  const v = new Array(12).fill(0);
  for (const i of ints) v[(rootPc + i) % 12] = 1;
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// Povprečni kromagram med a in b (polovice taktov iz audio.py).
function chromaBetween(audio, a, b) {
  const v = new Array(12).fill(0);
  let n = 0;
  const half = audio.bar / 2;
  for (const h of audio.halfBars) {
    const overlap = Math.min(b, h.t + half) - Math.max(a, h.t);
    if (overlap <= 0) continue;
    h.chroma.forEach((x, i) => (v[i] += x * overlap));
    n += overlap;
  }
  const norm = Math.hypot(...v);
  return n && norm ? v.map((x) => x / norm) : null;
}

// ---------------------------------------------------------------- ukazi
if (cmd === "list") {
  const rows = await rest(
    "songs?review_pending=eq.true&select=id,title,author,preferred_video_id,synced_lines,synced_chords,verified_player_at,created_at&order=created_at",
  );
  for (const s of rows)
    console.log(
      `${s.id}  ${s.title} — ${s.author}${s.verified_player_at ? "  [PREVERJENA — ne spreminjaj]" : ""}` +
        `${s.preferred_video_id ? `  video ${s.preferred_video_id}` : ""}${s.synced_lines ? "  časi vrstic" : ""}${s.synced_chords ? `  akordi: ${s.synced_chords.sections.map((x) => x.name).join(", ")}` : ""}`,
    );
} else if (cmd === "videos") {
  const s = await loadSong(id);
  const ids = [...new Set([s.preferred_video_id, youTubeId(s.youtube_url), youTubeId(s.youtube_music_url), ...(s.youtube_embed_ids ?? [])].filter(Boolean))];
  for (const v of ids) {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v}`)}&format=json`);
    const info = res.ok ? await res.json() : null;
    console.log(`${v}  ${res.ok ? "vgradnja OK" : `NE (oEmbed ${res.status})`}  ${info ? `${info.title} | kanal: ${info.author_name}` : ""}${v === s.preferred_video_id ? "  [izbran]" : ""}`);
  }
} else if (cmd === "editable") {
  const s = await loadSong(id);
  const out = arg("--out");
  if (!out) throw new Error("--out pot");
  writeFileSync(out, toEditableText(s.chords_text ?? ""), "utf8");
  console.log(`${s.title}: besedilo za urejanje → ${out}`);
} else if (cmd === "dump") {
  const s = await loadSong(id);
  const draft = arg("--text");
  const text = draft ? applyEditedText(s.chords_text ?? "", readFileSync(draft, "utf8")) : (s.chords_text ?? "");
  const body = bodyOf(text);
  const audio = arg("--audio") ? JSON.parse(readFileSync(arg("--audio"), "utf8")) : null;
  const duration = Number(arg("--duration")) || audio?.duration;
  console.log(`# ${s.title} — ${s.author}${draft ? "  (osnutek)" : ""}`);
  console.log(`video: ${s.preferred_video_id ?? "-"} | lrc_offsets: ${JSON.stringify(s.lrc_offsets ?? {})} | synced_lines: ${s.synced_lines ? `${s.synced_lines.points.length} točk (${s.synced_lines.videoId}${s.synced_lines.frozen ? ", zamrznjene" : ""})` : "-"} | synced_chords: ${s.synced_chords ? s.synced_chords.sections.map((x) => `${x.name}(${x.points.length})`).join(" ") + ` na ${s.synced_chords.videoId}` : "-"}`);
  // LRCLIB je včasih nedosegljiv (503) — vrstice in shranjeni časi se izpišejo vseeno.
  const { cands, c, aligned } = await lrcFor(s, body, duration, arg("--album")).catch((e) => {
    console.log(`(LRCLIB ni dosegljiv: ${e.message} — LRC stolpec prazen)`);
    return { cands: [], c: null, aligned: null };
  });
  const timeOf = new Map();
  for (const p of aligned?.points ?? []) if (!timeOf.has(p.lineIndex)) timeOf.set(p.lineIndex, p);
  // Shranjeni časi (synced_lines — ti veljajo v aplikaciji namesto LRC) in akordi (synced_chords).
  const saved = new Map();
  if (s.synced_lines?.points?.length)
    for (const p of remapLines(s.synced_lines.points, body).points) if (!saved.has(p.line)) saved.set(p.line, p);
  const savedChords = new Map();
  for (const sec of s.synced_chords?.sections ?? [])
    for (const p of remapLines(sec.points, body).points) savedChords.set(`${p.line}:${p.chord}`, `${sec.name}@${fmt(p.t)}`);
  console.log(`\n## Vrstice telesa (indeks | vrsta | čas LRC | ${saved.size ? "SHRANJEN čas | " : ""}akordi j:ime | besedilo | key)`);
  body.forEach((l, i) => {
    const p = timeOf.get(i);
    const sv = saved.get(i);
    const slots = chordSlots(l)
      .map((x) => `${x.j}:${x.name}${savedChords.has(`${i}:${x.j}`) ? `(${savedChords.get(`${i}:${x.j}`)})` : ""}`)
      .join(" ");
    const label = l.kind === "section" ? `[${l.label}]` : lyricOf(l);
    const savedCol = saved.size ? (sv ? `${fmt(sv.t).padStart(8)}–${fmt(sv.end ?? sv.t)}` : "".padStart(17)) + "  " : "";
    console.log(`${String(i).padStart(3)} ${l.kind.padEnd(7)} ${p ? fmt(p.time).padStart(8) + "–" + fmt(p.end) : "".padStart(17)}  ${savedCol}${slots.padEnd(30)} ${label}  ${l.kind !== "section" ? `{${lineKey(l)}}` : ""}`);
  });
  if (!c) console.log("\n## LRC: LRCLIB nima časovno označenega besedila — časov vrstic ne urejaj (pravilo skilla).");
  else {
    console.log(`\n## LRC: ${cands.length} kandidatov, izbran "${c.album}" ${c.duration} s; povezanih ${aligned.matched}/${c.lines.filter((l) => l.text).length}`);
    const used = new Set(aligned.points.map((p) => p.time));
    console.log(`vse različice: ${cands.map((x) => `"${x.album}" ${x.duration} s`).join(" | ")}`);
    const missing = c.lines.filter((l) => l.text && !used.has(l.time));
    console.log(`LRC vrstice BREZ para v tabu (manjkajo ali so drugače zapisane): ${missing.length}`);
    for (const l of missing) console.log(`  ${fmt(l.time)}  ${l.text}`);
    const sung = body.map((l, i) => [i, lyricOf(l)]).filter(([i, t]) => t && !timeOf.has(i));
    console.log(`Zapete vrstice taba BREZ časa: ${sung.length}`);
    for (const [i, t] of sung) console.log(`  ${i}  ${t}`);
    const gaps = [];
    const lines = c.lines;
    for (let k = 0; k < lines.length; k++) {
      const next = lines.slice(k + 1).find((l) => l.text);
      if (!lines[k].text && next && next.time - lines[k].time >= 6) gaps.push(`${fmt(lines[k].time)}–${fmt(next.time)}`);
    }
    if (lines.find((l) => l.text)?.time >= 6) gaps.unshift(`0:00–${fmt(lines.find((l) => l.text).time)} (intro)`);
    console.log(`Instrumentalni premori v LRC (≥ 6 s): ${gaps.join(", ") || "-"}`);
  }
  if (audio) {
    console.log(`\n## Posnetek ${audio.videoId}: ${audio.duration} s, glasba od ${audio.musicStart} s, ${audio.bpm} BPM, takt ${audio.bar} s od ${audio.downbeat} s`);
    // Tonaliteta: za premik k = 0..11 povprečno ujemanje akordov taba (premaknjenih) s posnetkom v času vrstic.
    const segs = [];
    for (const p of aligned?.points ?? []) {
      const slots = chordSlots(body[p.lineIndex]);
      if (!slots.length) continue;
      const v = chromaBetween(audio, p.time + (s.lrc_offsets?.[audio.videoId] ?? 0), p.end + (s.lrc_offsets?.[audio.videoId] ?? 0));
      if (v) segs.push({ p, names: slots.map((x) => x.name), v });
    }
    if (segs.length) {
      const scoreShift = (k) =>
        segs.reduce((sum, g) => sum + Math.max(...g.names.map((n) => (chordVector(transposeChord(n, k)) ? dot(chordVector(transposeChord(n, k)), g.v) : 0))), 0) / segs.length;
      const shifts = Array.from({ length: 12 }, (_, k) => ({ k, s: scoreShift(k) })).sort((a, b) => b.s - a.s);
      console.log(`Ujemanje akordov taba s posnetkom: brez premika ${r2(scoreShift(0))}; najboljši premik ${shifts[0].k > 6 ? shifts[0].k - 12 : shifts[0].k} poltonov (${r2(shifts[0].s)})${shifts[0].k === 0 ? " → tonaliteta ustreza" : " → TAB JE MORDA V DRUGI TONALITETI (ali capo) — samo poročaj"}`);
      const weak = segs
        .map((g) => ({ g, s: Math.max(...g.names.map((n) => (chordVector(n) ? dot(chordVector(n), g.v) : 0))) }))
        .filter((x) => x.s < 0.55);
      console.log(`Vrstice, kjer se akordi slabo ujemajo s posnetkom (< 0,55): ${weak.length}`);
      for (const { g, s: sc } of weak) console.log(`  ${g.p.lineIndex} @ ${fmt(g.p.time)}  ${g.names.join(" ")}  (${r2(sc)})`);
    }
  }
} else if (cmd === "write") {
  const s = await loadSong(id);
  if (s.verified_player_at) throw new Error(`"${s.title}" je preverjena (verified_player_at) — skill je ne spreminja.`);
  const patchPath = arg("--patch");
  if (!patchPath) throw new Error("--patch patch.json");
  const patch = JSON.parse(readFileSync(patchPath, "utf8"));
  const doWrite = process.argv.includes("--write");
  const update = {};
  const notes = [];
  // 1) besedilo
  let text = s.chords_text ?? "";
  let synced = { synced_lines: s.synced_lines, synced_chords: s.synced_chords };
  if (patch.text) {
    text = applyEditedText(s.chords_text ?? "", readFileSync(patch.text, "utf8"));
    if (text !== s.chords_text) {
      const rebase = rebaseSyncOnEdit(s, text);
      Object.assign(update, { chords_text: text }, rebase);
      synced = { ...synced, ...rebase };
      notes.push(`besedilo: ${s.chords_text?.split("\n").length ?? 0} → ${text.split("\n").length} vrstic${rebase.verified_player_at === null ? " (POZOR: preverjanje ponastavljeno)" : ""}`);
    }
  }
  const body = bodyOf(text);
  const withKey = (p) => {
    if (!body[p.line]) throw new Error(`vrstica ${p.line} ne obstaja (telo ima ${body.length} vrstic)`);
    const k = lineKey(body[p.line]);
    return k ? { ...p, key: k } : p;
  };
  // 2) video in zamik
  const video = patch.video ?? s.preferred_video_id ?? youTubeId(s.youtube_url);
  if (patch.video && patch.video !== s.preferred_video_id) {
    update.preferred_video_id = patch.video;
    notes.push(`video: ${s.preferred_video_id ?? "-"} → ${patch.video}`);
  }
  if (patch.lrcOffset != null) {
    update.lrc_offsets = { ...(s.lrc_offsets ?? {}), [video]: r2(patch.lrcOffset) };
    notes.push(`zamik LRC za ${video}: ${patch.lrcOffset} s`);
  }
  // 3) akordi intra/solov
  if (patch.chordSections?.length) {
    const prev = synced.synced_chords?.sections ?? [];
    if (synced.synced_chords?.videoId && synced.synced_chords.videoId !== video)
      notes.push(`POZOR: obstoječi deli z akordi so bili za ${synced.synced_chords.videoId} — zamenjani za ${video}`);
    const names = new Set(patch.chordSections.map((x) => x.name));
    const sections = [
      ...(synced.synced_chords?.videoId === video ? prev.filter((x) => !names.has(x.name)) : []),
      ...patch.chordSections.map((x, n) => {
        for (const p of x.points) {
          const slot = chordSlots(body[p.line] ?? { kind: "x" }).find((c) => c.j === p.chord);
          if (!slot) throw new Error(`${x.name}: v vrstici ${p.line} ni akorda z indeksom ${p.chord}`);
        }
        return {
          id: `${x.name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}-${n}`,
          name: x.name,
          offset: x.offset ?? 0,
          end: x.end ?? null,
          points: x.points.map((p) => withKey({ t: r3(p.t), line: p.line, chord: p.chord })).sort((a, b) => a.t - b.t),
        };
      }),
    ];
    // sungUnderline (skill podcrtaj-akorde) ostane, dokler je isti video.
    const keepFlags = synced.synced_chords?.videoId === video && synced.synced_chords.sungUnderline ? { sungUnderline: true } : {};
    update.synced_chords = { videoId: video, sections, ...keepFlags };
    notes.push(`akordi: ${sections.map((x) => `${x.name} ${x.points.length}× (${fmt(x.points[0]?.t ?? 0)}–${x.end != null ? fmt(x.end) : "?"})`).join(", ")}`);
  }
  // 4) časi vrstic: osnova = obstoječi ročni časi (po remapu) ali LRC poravnava novega besedila
  if (patch.lineOverrides?.length || patch.saveLines) {
    let base;
    if (synced.synced_lines?.points?.length) {
      base = remapLines(synced.synced_lines.points, body).points.map((p) => ({ t: p.t, end: p.end, line: p.line }));
      notes.push("časi vrstic: osnova = obstoječi shranjeni časi");
    } else {
      const { c, aligned } = await lrcFor(s, body, patch.duration, patch.lrcAlbum);
      if (!c) throw new Error("Ni LRC — časov vrstic ne zapisujem (pravilo skilla).");
      base = aligned.points.map((p) => ({ t: r3(p.time), end: r3(p.end), line: p.lineIndex }));
      notes.push(`časi vrstic: osnova = LRCLIB "${c.album}" (${c.duration} s)`);
    }
    for (const o of patch.lineOverrides ?? []) {
      const hit = base.filter((p) => p.line === o.line);
      if (!hit.length) base.push({ t: o.t, end: o.end ?? o.t + 5, line: o.line });
      for (const p of hit) {
        p.t = r3(o.t);
        if (o.end != null) p.end = r3(o.end);
      }
      notes.push(`  vrstica ${o.line} "${lyricOf(body[o.line]) || "(akordi)"}" → ${fmt(o.t)}${o.end != null ? `–${fmt(o.end)}` : ""}`);
    }
    update.synced_lines = { videoId: video, points: base.sort((a, b) => a.t - b.t).map(withKey) };
  }
  console.log(`# ${s.title} — ${s.author}`);
  for (const n of notes) console.log(n);
  if (!Object.keys(update).length) console.log("Ni sprememb.");
  else if (!doWrite) console.log(`\n(poskusno — za zapis dodaj --write; polja: ${Object.keys(update).join(", ")})`);
  else {
    mkdirSync(`${root}backups/spedenaj`, { recursive: true });
    const backup = `${root}backups/spedenaj/${s.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(backup, JSON.stringify(s, null, 1), "utf8");
    await rest(`songs?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify(update), headers: { ...headers, Prefer: "return=minimal" } });
    console.log(`\nzapisano (${Object.keys(update).join(", ")}); prejšnje stanje: ${backup}`);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 26).join("\n"));
  process.exit(cmd ? 1 : 0);
}
