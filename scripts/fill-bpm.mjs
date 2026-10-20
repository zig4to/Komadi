// Zapolni songs.bpm (tempo za metronom v pregledovalniku akordov) iz zvočne
// analize posnetka: scripts/spedenaj/audio.py (yt-dlp + kromagram, okolje
// %LOCALAPPDATA%\Komadi\spedenaj-venv — glej skill spedenaj). Video po vrsti:
// preferred_video_id, youtube_url, prvi youtube_embed_ids.
//
// Uporaba:
//   node --env-file=.env.local scripts/fill-bpm.mjs --id <song_id> [--dry]
//   node --env-file=.env.local scripts/fill-bpm.mjs [--dry]   (vse skladbe brez bpm, v paketih)
//
// Analiza včasih vrne polovični/dvojni tempo: vrednost se prestavi v 60–180.
// Ponoven zagon obdela samo skladbe, ki bpm še nimajo (napake se poberejo).

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !apiKey) {
  console.error("Manjkata NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (glej .env.local).");
  process.exit(1);
}

const args = process.argv.slice(2);
const idArg = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const dry = args.includes("--dry");
// YouTube po ~20 hitrih prenosih zahteva "Sign in to confirm you're not a bot".
const BATCH = 15;
const PAUSE_MS = 90_000;
const BETWEEN_MS = 4_000;

const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const root = fileURLToPath(new URL("..", import.meta.url));
const python = join(process.env.LOCALAPPDATA ?? "", "Komadi", "spedenaj-venv", "Scripts", "python.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function videoIdOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function analyse(videoId) {
  const dir = mkdtempSync(join(tmpdir(), "komadi-bpm-"));
  const out = join(dir, "a.json");
  return new Promise((resolve, reject) => {
    const p = spawn(python, [join(root, "scripts", "spedenaj", "audio.py"), videoId, "--out", out], { cwd: root });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      try {
        if (code !== 0) throw new Error(err.trim().split("\n").pop() || `audio.py ${code}`);
        resolve(JSON.parse(readFileSync(out, "utf8")).bpm);
      } catch (e) {
        reject(e);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

// Polovični/dvojni tempo → 60–180, celo število.
function normalize(bpm) {
  let b = Number(bpm);
  if (!Number.isFinite(b) || b <= 0) return null;
  while (b < 60) b *= 2;
  while (b > 180) b /= 2;
  return Math.round(b);
}

const filter = idArg ? `id=eq.${idArg}` : "bpm=is.null&order=created_at";
const res = await fetch(`${supabaseUrl}/rest/v1/songs?${filter}&select=id,title,author,preferred_video_id,youtube_url,youtube_embed_ids,bpm`, { headers });
const songs = await res.json();
if (!Array.isArray(songs)) {
  console.error(songs);
  process.exit(1);
}
console.log(`Skladb: ${songs.length}`);
let ok = 0;
for (let i = 0; i < songs.length; i++) {
  const s = songs[i];
  if (i > 0 && i % BATCH === 0) {
    console.log(`… premor ${PAUSE_MS / 1000} s (YouTube)`);
    await sleep(PAUSE_MS);
  } else if (i > 0) await sleep(BETWEEN_MS);
  const video = s.preferred_video_id ?? videoIdOf(s.youtube_url) ?? s.youtube_embed_ids?.[0];
  if (!video) {
    console.log(`✗ ${s.author} – ${s.title}: ni videa`);
    continue;
  }
  try {
    const raw = await analyse(video);
    const bpm = normalize(raw);
    if (!bpm) throw new Error(`neveljaven BPM ${raw}`);
    if (!dry) {
      const p = await fetch(`${supabaseUrl}/rest/v1/songs?id=eq.${s.id}`, { method: "PATCH", headers, body: JSON.stringify({ bpm }) });
      if (!p.ok) throw new Error(`PATCH ${p.status} ${await p.text()}`);
    }
    ok++;
    console.log(`✓ ${s.author} – ${s.title}: ${bpm} BPM (analiza ${raw}, video ${video})`);
  } catch (e) {
    console.log(`✗ ${s.author} – ${s.title}: ${e.message}`);
  }
}
console.log(`Končano: ${ok}/${songs.length}${dry ? " (poskusno, nič zapisano)" : ""}`);
