// Zapolni songs.chords_text (surov UG markup za vgrajen pregledovalnik
// ChordsViewer.tsx) iz UG tab strani v chords_source_url. Obstoječe povezave
// in PDF-ji ostanejo nespremenjeni.
//
// Uporaba:
//   node --env-file=.env.local scripts/fill-chords-text.mjs --id <song_id>
//   node --env-file=.env.local scripts/fill-chords-text.mjs --id <song_id> --dry
//   (brez --id: vse skladbe z UG povezavo in praznim chords_text, v paketih)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Manjkata NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (glej .env.local).");
  process.exit(1);
}

const args = process.argv.slice(2);
const idArg = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const dry = args.includes("--dry");
const BATCH = 20;
const PAUSE_MS = 60_000;

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// UG uporablja &nbsp; za poravnavo akordov (glej past v skillu
// dodaj-iz-cakalne-vrste, korak 7) — nujno ga pretvori v presledek.
const ENTITIES = {
  nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", amp: "&",
  scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č", zcaron: "ž", Zcaron: "Ž",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};
function decodeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? m;
  });
}

async function fetchUgContent(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`UG ${res.status}`);
  const html = await res.text();
  const m = html.match(/class="js-store"\s+data-content="([^"]*)"/);
  if (!m) throw new Error("js-store ni najden");
  const store = JSON.parse(decodeHtml(m[1]));
  const content = store?.store?.page?.data?.tab_view?.wiki_tab?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("ni wiki_tab.content");
  // Vsebina je po JSON.parse še lahko z entitetami (&nbsp; ipd.).
  return decodeHtml(content).replace(/\r\n/g, "\n");
}

async function getSongs() {
  const filter = idArg
    ? `id=eq.${idArg}`
    : "chords_source_url=not.is.null&chords_text=is.null";
  const res = await fetch(
    `${supabaseUrl}/rest/v1/songs?select=id,title,author,chords_source_url&${filter}&order=created_at.asc`,
    { headers },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function save(id, text) {
  const res = await fetch(`${supabaseUrl}/rest/v1/songs?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ chords_text: text }),
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
  if (!s.chords_source_url) {
    console.log(`- ${s.author} – ${s.title}: ni UG povezave`);
    continue;
  }
  try {
    const text = await fetchUgContent(s.chords_source_url);
    if (dry) console.log(text);
    else await save(s.id, text);
    done++;
    console.log(`✓ ${s.author} – ${s.title} (${text.length} znakov)`);
  } catch (e) {
    console.log(`✗ ${s.author} – ${s.title}: ${e.message}`);
  }
}
console.log(`Končano: ${done}/${songs.length}${dry ? " (dry run, nič zapisano)" : ""}`);
