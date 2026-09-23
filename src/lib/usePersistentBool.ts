"use client";

import { useCallback, useSyncExternalStore } from "react";

// Zapomni si true/false stanje v brskalniku (localStorage), da ostane enako
// tudi po osvežitvi strani. useSyncExternalStore poskrbi, da se strežniški
// (statični export) in prvi odjemalčev izris ujemata (brez hydration napak),
// custom "komadi-storage" dogodek pa sinhronizira neodvisne komponente, ki si
// delijo isti localStorage ključ (glej Filters.tsx: FiltersToggle + Filters).
const STORE_EVENT = "komadi-storage";

export function usePersistentBool(key: string, fallback: boolean) {
  const read = useCallback(() => {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch {
      return fallback;
    }
  }, [key, fallback]);

  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(STORE_EVENT, cb);
    return () => window.removeEventListener(STORE_EVENT, cb);
  }, []);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(read()) : next;
      try {
        window.localStorage.setItem(key, resolved ? "1" : "0");
      } catch {
        // pisanje ni mogoče — tiho ignoriramo
      }
      window.dispatchEvent(new Event(STORE_EVENT));
    },
    [key, read],
  );

  return [value, setValue] as const;
}
