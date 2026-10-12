"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { DEFAULT_PATTERN, PATTERN_OPACITY_MAX, isPatternId, type PatternId } from "@/lib/backgroundPatterns";

export type Theme = "system" | "light" | "dark";

const KEY = "komadi:theme";
const EVENT = "komadi-theme";
// Ozadje aplikacije (⋮ → Nastavitve → Tema → Ozadje): indeks v BACKGROUNDS
// (ista ozadja kot v pregledovalniku akordov / Sam Špili); "none" = osnovno
// ozadje teme (izbira "Osnovna"). Brez shranjene vrednosti velja ozadje teme
// (prenova videza: grafitno skoraj črno neutral-950 v temni temi; prej Antracit).
const BG_KEY = "komadi:appBg";
// Vzorec čez ozadje (⋮ → Nastavitve → Tema → Vzorec), samo v temni temi:
// id iz PATTERNS ali "none"; brez shranjene vrednosti DEFAULT_PATTERN.
const PATTERN_KEY = "komadi:appPattern";
// Vidnost vzorca (drsnik pod "Vzorec"): 0 … PATTERN_OPACITY_MAX, privzeto 1.
const PATTERN_OPACITY_KEY = "komadi:appPatternOpacity";
// Delci v ozadju (ozadja z `particles`): "0" = izklopljeni, privzeto vklopljeni.
const PARTICLES_KEY = "komadi:appParticles";
// Svetlost ozadja (drsnik pod "Ozadje"): BRIGHTNESS_MIN (−2 = −200 %) … BRIGHTNESS_MAX (+2 = +200 %), 0 = brez spremembe
// (ThemeProvider: črna tančica pod 0, bela nad 0).
const BRIGHTNESS_KEY = "komadi:appBrightness";

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

// Privzete vrednosti na telefonu (dokler uporabnik nastavitve ne spremeni):
// ozadje Dim (v temni temi), svetlost −50 %, vzorec Vrat kitare na 200 %.
// Računalnik: ozadje teme, 0 %, 100 %.
function isPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}
const PHONE_DEFAULT_BG = BACKGROUNDS.findIndex((b) => b.label === "Dim");
export const BRIGHTNESS_MIN = -2;
export const BRIGHTNESS_MAX = 2;
// Prosojnost bele tančice za svetlost > 0: postopno (0,2 na 100 %), do 0,4 pri +200 %.
export function lightVeilAlpha(b: number) {
  return Math.min(0.4, b * 0.2);
}
export function defaultBrightness() {
  return isPhone() ? -0.5 : 0;
}
// Prosojnost črne tančice za svetlost < 0: do −50 % enako kot prej (−b), naprej
// postopoma do 0,95 pri −200 % (ozadje skoraj črno, vsebina ostane berljiva).
export function darkVeilAlpha(b: number) {
  const d = -b;
  return d <= 0.5 ? d : Math.min(0.95, 0.5 + ((d - 0.5) / 1.5) * 0.45);
}
export function defaultPatternOpacity() {
  return isPhone() ? 2 : 1;
}

function readAppBg(): number | null {
  try {
    const v = localStorage.getItem(BG_KEY);
    if (v === "none") return null;
    if (v === null) return isPhone() && PHONE_DEFAULT_BG >= 0 && isDark(readTheme()) ? PHONE_DEFAULT_BG : null;
    const n = Number(v);
    return Number.isInteger(n) && BACKGROUNDS[n] ? n : null;
  } catch {
    return null;
  }
}

function readPattern(): PatternId | null {
  try {
    const v = localStorage.getItem(PATTERN_KEY);
    if (v === "none") return null;
    return isPatternId(v) ? v : DEFAULT_PATTERN;
  } catch {
    return DEFAULT_PATTERN;
  }
}

function readBrightness(): number {
  try {
    const n = Number(localStorage.getItem(BRIGHTNESS_KEY) ?? defaultBrightness());
    return Number.isFinite(n) ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, n)) : 0;
  } catch {
    return 0;
  }
}

function readParticles(): boolean {
  try {
    return localStorage.getItem(PARTICLES_KEY) !== "0";
  } catch {
    return true;
  }
}

function readPatternOpacity(): number {
  try {
    const v = localStorage.getItem(PATTERN_OPACITY_KEY);
    const n = v === null ? defaultPatternOpacity() : Number(v);
    return Number.isFinite(n) ? Math.min(PATTERN_OPACITY_MAX, Math.max(0, n)) : defaultPatternOpacity();
  } catch {
    return defaultPatternOpacity();
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
  const pattern = useSyncExternalStore(subscribe, readPattern, () => null);
  const patternOpacity = useSyncExternalStore(subscribe, readPatternOpacity, () => 1);
  const particles = useSyncExternalStore(subscribe, readParticles, () => true);
  const brightness = useSyncExternalStore(subscribe, readBrightness, () => 0);

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
  // (ozadje teme).
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

  // Ročna izbira teme vrne privzeto ozadje (ozadje teme) — svetlo ozadje pri temni temi bi dalo svetlo besedilo na svetlem.
  const setTheme = useCallback((next: Theme) => store(next, "default"), []);

  // Ozadje določi tudi temo: svetla ozadja (Bela, Siva) → svetla, ostala → temna.
  // null = osnovno ozadje teme, tema ostane.
  const setAppBg = useCallback((index: number | null) => {
    if (index === null) store(readTheme(), null);
    else store(BACKGROUNDS[index].light ? "light" : "dark", index);
  }, []);

  // null = brez vzorca.
  const setPattern = useCallback((next: PatternId | null) => {
    try {
      localStorage.setItem(PATTERN_KEY, next ?? "none");
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setPatternOpacity = useCallback((next: number) => {
    try {
      localStorage.setItem(PATTERN_OPACITY_KEY, String(Math.min(PATTERN_OPACITY_MAX, Math.max(0, next))));
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setParticles = useCallback((on: boolean) => {
    try {
      localStorage.setItem(PARTICLES_KEY, on ? "1" : "0");
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setBrightness = useCallback((next: number) => {
    try {
      localStorage.setItem(BRIGHTNESS_KEY, String(Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, next))));
    } catch {
      // localStorage ni na voljo — izbira se ne bo ohranila
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, setTheme, appBg, setAppBg, pattern, setPattern, patternOpacity, setPatternOpacity, particles, setParticles, brightness, setBrightness };
}
