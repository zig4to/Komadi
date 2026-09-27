"use client";

import { useCallback, useSyncExternalStore } from "react";

// Katera skladba je odprta v "Akordi v aplikaciji" (ChordsViewer.tsx) —
// zapomnjeno v localStorage, da po osvežitvi strani (telefon in računalnik)
// ostane odprta. Odpre jo ChordsButtons.tsx, izriše pa samo Dashboard.tsx (en
// pregledovalnik, tudi če je ista skladba na strani večkrat). Isti dogodek
// "komadi-storage" kot usePersistentBool/usePersistentString.
const KEY = "komadi:chords:open";
const STORE_EVENT = "komadi-storage";

function write(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(STORE_EVENT));
}

export const openChordsViewer = (songId: string) => write(songId);
export const closeChordsViewer = () => write(null);

export function useOpenChordsSongId(): string | null {
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }, []);
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(STORE_EVENT, cb);
    return () => window.removeEventListener(STORE_EVENT, cb);
  }, []);
  return useSyncExternalStore(subscribe, read, () => null);
}
