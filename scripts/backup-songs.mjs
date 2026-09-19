// Ročni backup tabele `songs` iz Supabase v lokalno JSON datoteko.
// Poganja se prek REST API-ja z anon ključem (RLS dovoljuje javno branje),
// zato ni potreben Supabase CLI, Docker ali geslo baze.
//
// Uporaba:
//   npm run backup

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error(
    "Manjkata NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (glej .env.local).",
  );
  process.exit(1);
}

const PAGE_SIZE = 1000;

async function fetchAllSongs() {
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${supabaseUrl}/rest/v1/songs?select=*&order=created_at.asc`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Range: `${from}-${from + PAGE_SIZE - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase napaka ${res.status}: ${await res.text()}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

const songs = await fetchAllSongs();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(process.cwd(), "backups");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `songs-${stamp}.json`);
await writeFile(outFile, JSON.stringify(songs, null, 2), "utf8");

console.log(`Shranjenih ${songs.length} skladb v ${outFile}`);
