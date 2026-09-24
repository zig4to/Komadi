"use client";

import { useCallback, useSyncExternalStore } from "react";

// Besedilna različica usePersistentBool — zapomni si izbrano vrednost (npr.
// vrstni red seznama v SortMenu.tsx) v localStorage, sinhronizirano prek
// istega "komadi-storage" dogodka.
const STORE_EVENT = "komadi-storage";

export function usePersistentString<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const read = useCallback((): T => {
    try {
      const v = window.localStorage.getItem(key);
      return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback, allowed]);

  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(STORE_EVENT, cb);
    return () => window.removeEventListener(STORE_EVENT, cb);
  }, []);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // pisanje ni mogoče — tiho ignoriramo
      }
      window.dispatchEvent(new Event(STORE_EVENT));
    },
    [key],
  );

  return [value, setValue] as const;
}
