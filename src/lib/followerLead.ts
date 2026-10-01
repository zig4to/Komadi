"use client";

import { useCallback, useSyncExternalStore } from "react";

// Skupni Jam → "Zakasnitev sledilcev" (zobnik v glavi Jama): koliko sekund naj
// sledilec vodjev položaj prehiteva, da izravna zamik Realtime sporočil
// (običajno ~250 ms). Velja za akorde v aplikaciji in Sam Špili, samo na tej
// napravi (localStorage), v korakih po 0,25 s.
const KEY = "komadi:jam:followerLead";
const STORE_EVENT = "komadi-storage";
export const FOLLOWER_LEAD_STEP = 0.25;
export const FOLLOWER_LEAD_MAX = 2;
export const FOLLOWER_LEAD_DEFAULT = 0.25;

export function readFollowerLead(): number {
  try {
    const v = window.localStorage.getItem(KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 && n <= FOLLOWER_LEAD_MAX ? n : FOLLOWER_LEAD_DEFAULT;
  } catch {
    return FOLLOWER_LEAD_DEFAULT;
  }
}

export function useFollowerLead() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(STORE_EVENT, cb);
    return () => window.removeEventListener(STORE_EVENT, cb);
  }, []);
  const value = useSyncExternalStore(subscribe, readFollowerLead, () => FOLLOWER_LEAD_DEFAULT);
  const setValue = useCallback((next: number) => {
    const clamped = Math.min(FOLLOWER_LEAD_MAX, Math.max(0, Math.round(next / FOLLOWER_LEAD_STEP) * FOLLOWER_LEAD_STEP));
    try {
      window.localStorage.setItem(KEY, String(clamped));
    } catch {
      // pisanje ni mogoče — velja samo do osvežitve
    }
    window.dispatchEvent(new Event(STORE_EVENT));
  }, []);
  return [value, setValue] as const;
}
