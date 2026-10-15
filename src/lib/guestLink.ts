import { supabase } from "@/lib/supabaseClient";

// Skupni Jam za goste (0040_jam_guest_links.sql): nova povezava "?gost=<žeton>",
// veljavna 24 ur. Deljenje odpre okno ShareSheet.tsx (omrežja, kopiranje,
// sistemski meni).
export const GUEST_SHARE_TEXT = "Pridruži se Skupnemu Jamu — akordi v brskalniku (povezava velja 24 ur):";

export async function createGuestLink(): Promise<{ url: string } | { error: string }> {
  const { data, error } = await supabase.from("jam_guest_links").insert({}).select("token").single();
  if (error || !data) return { error: `Povezave ni bilo mogoče ustvariti: ${error?.message ?? "neznana napaka"}` };
  return { url: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/?gost=${data.token}` };
}

export function guestTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("gost");
  return t && /^[0-9a-f]{16,64}$/i.test(t) ? t : null;
}
