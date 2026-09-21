"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "komadi:theme";
const EVENT = "komadi-theme";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

/**
 * Bere in nastavlja temo aplikacije (svetla / temna / sistemska).
 * Vrednost se shrani v localStorage in ostane po osvežitvi.
 */
export function useTheme() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVENT, cb);
    return () => window.removeEventListener(EVENT, cb);
  }, []);

  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "light" as Theme,
  );

  // Poskrbi, da se razred .dark ujema z izbiro tudi ob spremembi sistemske
  // nastavitve (ko je izbrana "sistemska").
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(readTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // localStorage ni na voljo — tema se ne bo ohranila
    }
    applyTheme(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, setTheme };
}
