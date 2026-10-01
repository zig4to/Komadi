"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { BACKGROUNDS } from "@/lib/backgrounds";

export type Theme = "system" | "light" | "dark";

const KEY = "komadi:theme";
const EVENT = "komadi-theme";
// Ozadje aplikacije (⋮ → Nastavitve → Tema → Ozadje): indeks v BACKGROUNDS
// (ista ozadja kot v pregledovalniku akordov / Sam Špili); "none" = osnovno
// ozadje teme (izbira "Osnovna"). Brez shranjene vrednosti velja Antracit —
// a samo pri temni temi (pri svetli bi bilo temno besedilo na temnem ozadju).
const BG_KEY = "komadi:appBg";
const DEFAULT_APP_BG = BACKGROUNDS.findIndex((b) => b.label === "Antracit");

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", isDark(theme));
}

function applyAppBg(index: number | null) {
  document.body.style.backgroundColor = index === null ? "" : (BACKGROUNDS[index]?.bg ?? "");
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

function isDark(theme: Theme) {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function readAppBg(): number | null {
  try {
    const v = localStorage.getItem(BG_KEY);
    if (v === "none") return null;
    if (v === null) return isDark(readTheme()) && DEFAULT_APP_BG >= 0 ? DEFAULT_APP_BG : null;
    const n = Number(v);
    return Number.isInteger(n) && BACKGROUNDS[n] ? n : null;
  } catch {
    return null;
  }
}

/**
 * Bere in nastavlja temo aplikacije (svetla / temna / sistemska) in ozadje
 * aplikacije. Vrednosti se shranijo v localStorage in ostanejo po osvežitvi.
 */
export function useTheme() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVENT, cb);
    return () => window.removeEventListener(EVENT, cb);
  }, []);

  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "dark" as Theme,
  );
  const appBg = useSyncExternalStore(subscribe, readAppBg, () => null);

  // Poskrbi, da se razred .dark ujema z izbiro tudi ob spremembi sistemske
  // nastavitve (ko je izbrana "sistemska").
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(readTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    applyAppBg(appBg);
  }, [appBg]);

  // bg: indeks, null = "Osnovna" (ozadje teme), "default" = brez izbire
  // (pri temni temi Antracit, pri svetli ozadje teme).
  const store = (theme: Theme, bg: number | null | "default") => {
    try {
      localStorage.setItem(KEY, theme);
      if (bg === "default") localStorage.removeItem(BG_KEY);
      else localStorage.setItem(BG_KEY, bg === null ? "none" : String(bg));
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    applyTheme(theme);
    applyAppBg(readAppBg());
    window.dispatchEvent(new Event(EVENT));
  };

  // Ročna izbira teme vrne privzeto ozadje (Antracit pri temni, ozadje teme pri
  // svetli) — svetlo ozadje pri temni temi bi dalo svetlo besedilo na svetlem.
  const setTheme = useCallback((next: Theme) => store(next, "default"), []);

  // Ozadje določi tudi temo: svetla ozadja (Bela, Siva) → svetla, ostala → temna.
  // null = osnovno ozadje teme, tema ostane.
  const setAppBg = useCallback((index: number | null) => {
    if (index === null) store(readTheme(), null);
    else store(BACKGROUNDS[index].light ? "light" : "dark", index);
  }, []);

  return { theme, setTheme, appBg, setAppBg };
}
