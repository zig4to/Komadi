import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Med buildom (prerendering) ali dokler .env.local ni nastavljen, spremenljivk
// še ni na voljo — client ustvarimo šele, ko obstajata; komponente naj pred
// klicem preverijo `isSupabaseConfigured`.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            "Supabase ni nastavljen. Nastavi NEXT_PUBLIC_SUPABASE_URL in NEXT_PUBLIC_SUPABASE_ANON_KEY v .env.local (glej .env.local.example)."
          );
        },
      }
    ) as SupabaseClient);
