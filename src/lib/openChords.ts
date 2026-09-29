"use client";

import { useCallback, useSyncExternalStore } from "react";

// Katera skladba je odprta v "Akordi v aplikaciji" (ChordsViewer.tsx) —
// zapomnjeno v localStorage, da po osvežitvi strani (telefon in računalnik)
// ostane odprta. Odpre jo ChordsButtons.tsx, izriše pa samo Dashboard.tsx (en
// pregledovalnik, tudi če je ista skladba na strani večkrat). Isti dogodek
// "komadi-storage" kot usePersistentBool/usePersistentString.
const KEY = "komadi:chords:open";
// Način odprtja: "samspili" = celozaslonski pogled s 3 vrsticami (ChordsViewer
// prop samSpili), brez vrednosti = navaden pregledovalnik.
const MODE_KEY = "komadi:chords:mode";
const STORE_EVENT = "komadi-storage";

export type ChordsViewerMode = "samspili";

function write(id: string | null, mode?: ChordsViewerMode) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
    if (id && mode) window.localStorage.setItem(MODE_KEY, mode);
    else window.localStorage.removeItem(MODE_KEY);
  } catch {}
  window.dispatchEvent(new Event(STORE_EVENT));
}

export const openChordsViewer = (songId: string, mode?: ChordsViewerMode) => write(songId, mode);
export const closeChordsViewer = () => write(null);

// Celozaslonsko + ležeče za "Sam špili". Klicati neposredno iz uporabnikovega
// klika: requestFullscreen porabi dovoljenje tega klika, zato NE sme biti v
// istem kliku kot zagon YouTuba (ta bi potem ostal utišan/ustavljen).
export function enterLandscapeFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
    .catch(() => {});
}

export function useOpenChordsMode(): ChordsViewerMode | null {
  const read = useCallback((): ChordsViewerMode | null => {
    try {
      return window.localStorage.getItem(MODE_KEY) === "samspili" ? "samspili" : null;
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
