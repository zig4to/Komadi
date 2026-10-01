"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { BACKGROUNDS } from "@/lib/backgrounds";

export type Theme = "system" | "light" | "dark";

const KEY = "komadi:theme";
const EVENT = "komadi-theme";
// Ozadje aplikacije (⋮ → Nastavitve → Tema → Ozadje): indeks v BACKGROUNDS
// (ista ozadja kot v pregledovalniku akordov / Sam Špili), brez vrednosti =
// privzeto ozadje teme.
const BG_KEY = "komadi:appBg";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
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

function readAppBg(): number | null {
  try {
    const v = localStorage.getItem(BG_KEY);
    const n = v === null ? NaN : Number(v);
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

  const store = (theme: Theme, bg: number | null) => {
    try {
      localStorage.setItem(KEY, theme);
      if (bg === null) localStorage.removeItem(BG_KEY);
      else localStorage.setItem(BG_KEY, String(bg));
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    applyTheme(theme);
    applyAppBg(bg);
    window.dispatchEvent(new Event(EVENT));
  };

  // Ročna izbira teme vrne privzeto ozadje (svetlo ozadje pri temni temi bi
  // dalo svetlo besedilo na svetlem).
  const setTheme = useCallback((next: Theme) => store(next, null), []);

  // Ozadje določi tudi temo: svetla ozadja (Bela, Siva) → svetla, ostala → temna.
  // null = privzeto ozadje, tema ostane.
  const setAppBg = useCallback((index: number | null) => {
    if (index === null) store(readTheme(), null);
    else store(BACKGROUNDS[index].light ? "light" : "dark", index);
  }, []);

  return { theme, setTheme, appBg, setAppBg };
}
