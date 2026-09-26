// Zapolni songs.youtube_embed_ids: rezervne YouTube videe iste skladbe (prvi
// zadetki iskanja "avtor naslov"), ki jih mini predvajalnik v pregledovalniku
// akordov (YouTubeMiniPlayer.tsx) preizkuša po vrsti, kadar youtube_url ne
// dovoli vgradnje. Vgradljivosti tu ni mogoče zanesljivo preveriti — to
// naredi predvajalnik sam v brskalniku.
//
// Uporaba:
//   node --env-file=.env.local scripts/fill-youtube-embed-ids.mjs --id <song_id>
//   node --env-file=.env.local scripts/fill-youtube-embed-ids.mjs --id <song_id> --dry
//   (brez --id: vse skladbe s chords_text in praznim youtube_embed_ids, v paketih)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Manjkata NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (glej .env.local).");
  process.exit(1);
}

const args = process.argv.slice(2);
const idArg = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const dry = args.includes("--dry");
// YouTube po ~20 hitrih iskanjih omeji dostop (glej CLAUDE.md, youtube_url).
const BATCH = 20;
const PAUSE_MS = 60_000;
const MAX_IDS = 8;
const MAX_SECONDS = 8 * 60;

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function seconds(text) {
  if (!text) return 0;
  return text.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
}

async function searchYouTube(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`YouTube ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error("ytInitialData ni najden");
  const results = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      results.push({ id: v.videoId, title: v.title?.runs?.[0]?.text ?? "", length: seconds(v.lengthText?.simpleText) });
    }
    for (const k in o) walk(o[k]);
  })(JSON.parse(m[1]));
  return results;
}

// Studijske/lyric verzije najprej, živi nastopi na konec; brez predolgih (mix, celi albumi).
function pickIds(results, exclude) {
  const ok = results.filter((r) => r.id && r.length > 0 && r.length <= MAX_SECONDS && !exclude.has(r.id));
  const isLive = (r) => /\blive\b|concert|koncert/i.test(r.title);
  return [...ok.filter((r) => !isLive(r)), ...ok.filter(isLive)].slice(0, MAX_IDS);
}

function videoId(url) {
  try {
    const u = new URL(url);
    return u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
  } catch {
    return null;
  }
}

async function getSongs() {
  const filter = idArg ? `id=eq.${idArg}` : "chords_text=not.is.null&youtube_embed_ids=is.null";
  const res = await fetch(
    `${supabaseUrl}/rest/v1/songs?select=id,title,author,youtube_url,youtube_music_url&${filter}&order=created_at.asc`,
    { headers },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function save(id, ids) {
  const res = await fetch(`${supabaseUrl}/rest/v1/songs?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ youtube_embed_ids: ids }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

const songs = await getSongs();
console.log(`Skladb: ${songs.length}`);
let done = 0;
for (const [i, s] of songs.entries()) {
  if (i > 0 && i % BATCH === 0) {
    console.log(`Pavza ${PAUSE_MS / 1000}s …`);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  try {
    const exclude = new Set([videoId(s.youtube_url), videoId(s.youtube_music_url)].filter(Boolean));
    const picked = pickIds(await searchYouTube(`${s.author} ${s.title}`), exclude);
    if (dry) for (const r of picked) console.log(`   ${r.id}  ${r.title}`);
    else await save(s.id, picked.map((r) => r.id));
    done++;
    console.log(`✓ ${s.author} – ${s.title} (${picked.length} videov)`);
  } catch (e) {
    console.log(`✗ ${s.author} – ${s.title}: ${e.message}`);
  }
}
console.log(`Končano: ${done}/${songs.length}${dry ? " (dry run, nič zapisano)" : ""}`);
