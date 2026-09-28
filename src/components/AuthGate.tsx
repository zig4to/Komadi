"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Dashboard from "@/components/Dashboard";
import LoginScreen from "@/components/LoginScreen";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

// Obvezna prijava (isti Supabase Auth kot hub TomStudios, glej
// TomsStudios/auth.js in docs/sso-integration-recipe.md). Na
// zig4to.github.io si Komadi s hubom delijo izvor in s tem localStorage, zato
// getSession() sam najde sejo huba — supabaseClient.ts zato NE sme nastaviti
// lastnega storageKey. Iz drugih izvorov lahko povezava nosi sejo v hashu
// (#sb_at=…&sb_rt=…), ki jo tu prevzamemo.
type Status = "loading" | "signed-out" | "recovery" | "signed-in";

function readSsoHash(): { access_token: string; refresh_token: string } | null {
  const m = /sb_at=([^&]+)&sb_rt=([^&]+)/.exec(window.location.hash);
  if (!m) return null;
  return { access_token: decodeURIComponent(m[1]), refresh_token: decodeURIComponent(m[2]) };
}

export default function AuthGate() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recoveringRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    // Povezava iz e-pošte za ponastavitev gesla (implicit flow: #…type=recovery).
    recoveringRef.current = window.location.hash.includes("type=recovery");

    const apply = (next: User | null) => {
      if (cancelled) return;
      if (recoveringRef.current) {
        setUser(next);
        setStatus(next ? "recovery" : "signed-out");
        return;
      }
      setUser(next);
      setStatus(next ? "signed-in" : "signed-out");
    };

    // Varnostni izklop: če preverjanje seje obtiči (počasno omrežje na
    // telefonu), raje pokaži prijavo kot neskončen nalagalnik.
    const timeout = window.setTimeout(() => {
      setNotice("Preverjanje prijave traja dlje kot običajno. Poskusi znova, če se ne naloži.");
      apply(null);
    }, 8000);

    (async () => {
      const sso = readSsoHash();
      if (sso) {
        await supabase.auth.setSession(sso).catch(() => null);
        // Žetona takoj počisti iz naslovne vrstice in zgodovine.
        history.replaceState(history.state, "", window.location.pathname + window.location.search);
      }
      try {
        const { data } = await supabase.auth.getSession();
        window.clearTimeout(timeout);
        apply(data.session?.user ?? null);
      } catch {
        window.clearTimeout(timeout);
        setNotice("Preverjanje prijave ni uspelo. Preveri povezavo in poskusi znova.");
        apply(null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Začetno stanje obravnava getSession() zgoraj (INITIAL_SESSION lahko
      // pride z null, preden je seja iz localStorage prebrana).
      if (event === "INITIAL_SESSION") return;
      window.clearTimeout(timeout);
      if (event === "PASSWORD_RECOVERY") recoveringRef.current = true;
      // Osvežen žeton istega uporabnika ne sme ponovno izrisati aplikacije.
      if (event === "TOKEN_REFRESHED") return;
      apply(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm text-neutral-600 dark:text-neutral-300">
        Supabase ni nastavljen. Nastavi NEXT_PUBLIC_SUPABASE_URL in NEXT_PUBLIC_SUPABASE_ANON_KEY v .env.local.
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 text-sm text-neutral-500">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
        Nalagam …
      </div>
    );
  }

  if (status === "signed-in" && user) {
    // key: ob menjavi uporabnika se vse stanje Dashboarda začne na novo.
    return <Dashboard key={user.id} user={user} />;
  }

  return (
    <LoginScreen
      recovery={status === "recovery"}
      notice={notice}
      onRecoveryDone={() => {
        recoveringRef.current = false;
        window.history.replaceState(history.state, "", window.location.pathname + window.location.search);
        setStatus(user ? "signed-in" : "signed-out");
      }}
    />
  );
}
