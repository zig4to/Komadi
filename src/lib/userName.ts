import type { User } from "@supabase/supabase-js";

// Ime uporabnika iz user_metadata v več oblikah: first/last_name (registracija
// v Komadi ali hubu TomStudios), sicer given/family_name ali enotno
// full_name/name/display_name. Prazen niz, če imena ni.
export function fullNameFor(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const first = str(meta.first_name) || str(meta.given_name);
  const last = str(meta.last_name) || str(meta.family_name);
  return `${first} ${last}`.trim() || str(meta.full_name) || str(meta.name) || str(meta.display_name);
}

// Začetnici imena in priimka ("Žiga Tomše" → "ŽT"); brez imena prvi dve črki
// nadomestila (npr. e-pošte).
export function initialsOf(name: string, fallback = ""): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length) {
    const ini = (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    if (ini) return ini;
  }
  return fallback.slice(0, 2).toUpperCase() || "?";
}

export function initialsFor(user: User): string {
  return initialsOf(fullNameFor(user), user.email ?? "");
}
