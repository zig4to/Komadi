// Supabase Edge Function: za podano skladbo z Anthropic API (Claude) prek
// spletnega iskanja poišče podobne skladbe.
//
// Ne potrebuje novega secreta — uporablja isti ANTHROPIC_API_KEY kot
// guess-era. Deploy:
//   supabase functions deploy similar-songs
const RESULT_COUNT = 7;
const SAME_AUTHOR_COUNT = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SongRef {
  title: string;
  author: string;
}

function isSongRef(v: unknown): v is SongRef {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === "string" && o.title.trim().length > 0 &&
    typeof o.author === "string" && o.author.trim().length > 0;
}

// Iz besedila odgovora izlušči veljaven JSON seznam {title, author}. Model
// naj bi vrnil IZKLJUČNO JSON, a za vsak primer poskusimo tudi izrez med
// prvim "[" in zadnjim "]" (npr. če se prikrade uvodni stavek).
function extractSongs(text: string): SongRef[] | null {
  const tryParse = (s: string): SongRef[] | null => {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.every(isSongRef)) return parsed;
    } catch {
      // padi na naslednji poskus
    }
    return null;
  };

  const direct = tryParse(text.trim());
  if (direct) return direct;

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    const sliced = tryParse(text.slice(start, end + 1));
    if (sliced) return sliced;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Samo POST." }, 405);
  }

  let title: string;
  let author: string;
  let exclude: SongRef[];
  try {
    const body = await req.json();
    title = String(body.title ?? "").trim();
    author = String(body.author ?? "").trim();
    exclude = Array.isArray(body.exclude) ? body.exclude.filter(isSongRef) : [];
  } catch {
    return json({ error: "Neveljaven JSON." }, 400);
  }

  if (!title || !author) {
    return json({ error: "title in author sta obvezna." }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY ni nastavljen (supabase secrets set)." }, 500);
  }

  const alreadyKnown = [{ title, author }, ...exclude]
    .map((s) => `- ${s.title} — ${s.author}`)
    .join("\n");

  const system =
    "Si glasbeni strokovnjak s spletnim dostopom (orodje web_search). Tvoja NALOGA: " +
    "za IZVORNO skladbo, ki jo uporabnik navede v svojem sporočilu, poišči na spletu " +
    `in vedno vrni natanko ${RESULT_COUNT} GLASBENO PODOBNIH skladb (podoben žanr, ` +
    "slog, obdobje ali razpoloženje). Okvirno (ne strogo pravilo, samo smernica) naj " +
    `bo približno ${SAME_AUTHOR_COUNT} predlogov istega izvajalca kot izvorna skladba, ` +
    "ostali naj bodo drugih izvajalcev — če za izvajalca ni dovolj smiselnih (res " +
    "podobnih) skladb, to razmerje prilagodi in raje vrni več predlogov drugih " +
    "izvajalcev, kot da bi silil neustrezne.\n\n" +
    "Spodnji 'seznam že znanih skladb' je INFORMACIJA, ne prepoved obravnave: te " +
    "skladbe (vključno z izvorno skladbo samo) uporabnik že pozna, zato jih NE SMEŠ " +
    `vključiti med svojimi ${RESULT_COUNT} PREDLOGI — a nalogo (najti ${RESULT_COUNT} ` +
    "novih podobnih skladb) moraš vseeno vedno izvesti, tudi če je izvorna skladba na " +
    "tem seznamu (to je pričakovano in normalno, saj je izvorna skladba vedno " +
    "navedena).\n\n" +
    "Seznam že znanih skladb (ne predlagaj teh nazaj):\n" +
    alreadyKnown +
    "\n\nOdgovori IZKLJUČNO z veljavnim JSON seznamom, brez uvodnega besedila, brez " +
    'razlage, brez code fence, natanko v obliki: [{"title":"...","author":"..."}, ...] ' +
    `— natanko ${RESULT_COUNT} elementov. Nikoli ne odgovori s prostim besedilom.`;

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: `Izvorna skladba — naslov: ${title}, izvajalec: ${author}` },
  ];

  let finalText = "";
  try {
    // Do 3 poskusov, ker lahko dolgotrajen klic orodja (spletno iskanje)
    // vrne stop_reason "pause_turn" namesto končnega odgovora — takrat
    // pogovor nadaljujemo tako, da pošljemo nazaj celoten asistentov delni
    // odgovor in počakamo na nadaljevanje.
    for (let attempt = 0; attempt < 3; attempt++) {
      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1536,
          system,
          messages,
          // web_search_20260209 (dinamično filtriranje) po dokumentaciji ni
          // potrjeno podprt za Haiku 4.5 — uporabimo starejšo, univerzalno
          // podprto različico.
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        }),
      });

      if (!aiResponse.ok) {
        const text = await aiResponse.text();
        return json({ error: `AI napaka (${aiResponse.status}): ${text}` }, 502);
      }

      const data = await aiResponse.json();
      const content = data?.content ?? [];
      const textBlocks = content.filter(
        (b: { type?: string }) => b?.type === "text",
      ) as Array<{ text?: string }>;
      finalText = String(textBlocks.at(-1)?.text ?? "").trim();

      if (data?.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content });
        continue;
      }
      break;
    }
  } catch (err) {
    return json({ error: `Klic AI ni uspel: ${String(err)}` }, 502);
  }

  const songs = extractSongs(finalText);
  if (!songs) {
    return json({ error: `Nepričakovan odgovor AI: "${finalText}"` }, 502);
  }

  const excludeKeys = new Set(
    [{ title, author }, ...exclude].map((s) => `${s.title.toLowerCase()}|${s.author.toLowerCase()}`),
  );
  const filtered = songs.filter(
    (s) => !excludeKeys.has(`${s.title.toLowerCase()}|${s.author.toLowerCase()}`),
  );

  return json({ songs: filtered.slice(0, RESULT_COUNT) });
});
