// Supabase Edge Function: ob podanem naslovu in avtorju skladbe z Anthropic
// API (Claude) oceni desetletje prvotne izdaje.
//
// Deploy:
//   supabase functions deploy guess-era
// Nastavi skrivni ključ (nikoli ne gre v .env.local / NEXT_PUBLIC_*):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Vrednosti spodaj morajo ostati usklajene s src/lib/constants.ts (ERAS).
const ERAS = [
  "Pred 1960",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Samo POST." }, 405);
  }

  let title: string;
  let author: string;
  try {
    const body = await req.json();
    title = String(body.title ?? "").trim();
    author = String(body.author ?? "").trim();
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

  let aiResponse: Response;
  try {
    aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 20,
        system:
          "Si glasbeni strokovnjak. Za podano skladbo (naslov in izvajalec) določi " +
          "desetletje prvotne izdaje. Odgovori IZKLJUČNO z eno od naslednjih vrednosti, " +
          `brez dodatnega besedila ali pojasnil: ${ERAS.join(", ")}. Če skladbe ne poznaš ` +
          "zanesljivo, kljub temu oceni najverjetnejše desetletje glede na znano obdobje " +
          "delovanja izvajalca in slog skladbe.",
        messages: [{ role: "user", content: `Naslov: ${title}\nIzvajalec: ${author}` }],
      }),
    });
  } catch (err) {
    return json({ error: `Klic AI ni uspel: ${String(err)}` }, 502);
  }

  if (!aiResponse.ok) {
    const text = await aiResponse.text();
    return json({ error: `AI napaka (${aiResponse.status}): ${text}` }, 502);
  }

  const data = await aiResponse.json();
  const raw = String(data?.content?.[0]?.text ?? "").trim();
  const era = ERAS.find((e) => raw.includes(e));

  if (!era) {
    return json({ error: `Nepričakovan odgovor AI: "${raw}"` }, 502);
  }

  return json({ era });
});
