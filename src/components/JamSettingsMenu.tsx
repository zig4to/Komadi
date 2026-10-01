"use client";

import { useEffect, useRef, useState } from "react";
import { FOLLOWER_LEAD_MAX, FOLLOWER_LEAD_STEP, useFollowerLead } from "@/lib/followerLead";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Gumb z zobnikom desno od "Nazaj" v glavi Jama — spustni meni z nastavitvami,
// ki veljajo samo za Jam.
export default function JamSettingsMenu() {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useFollowerLead();
  const leadLabel = `${lead.toFixed(2).replace(".", ",")} s`;
  const rootRef = useRef<HTMLDivElement>(null);
  useBackableOpen(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Nastavitve Jama"
        title="Nastavitve Jama"
        className={`inline-flex items-center justify-center rounded-full p-1.5 transition ${
          open
            ? "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400"
            : "text-neutral-600 hover:text-fuchsia-600 dark:text-neutral-300 dark:hover:text-fuchsia-400"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px] shrink-0"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
            Nastavitve Jama
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-neutral-800 dark:text-neutral-100">Zakasnitev sledilcev</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setLead(lead - FOLLOWER_LEAD_STEP)}
                disabled={lead <= 0}
                aria-label="Zmanjšaj za 0,25 s"
                className="h-7 w-7 rounded-full border border-fuchsia-500/50 text-fuchsia-600 hover:bg-fuchsia-500/10 disabled:opacity-40 dark:text-fuchsia-400"
              >
                −
              </button>
              <span className="w-14 text-center text-xs font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{leadLabel}</span>
              <button
                type="button"
                onClick={() => setLead(lead + FOLLOWER_LEAD_STEP)}
                disabled={lead >= FOLLOWER_LEAD_MAX}
                aria-label="Povečaj za 0,25 s"
                className="h-7 w-7 rounded-full border border-fuchsia-500/50 text-fuchsia-600 hover:bg-fuchsia-500/10 disabled:opacity-40 dark:text-fuchsia-400"
              >
                +
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
            Ko slediš vodji v Skupnem Jamu (akordi v aplikaciji in Sam Špili), je tvoj pogled za toliko naprej — izravna
            zamik prenosa (običajno ~0,25 s). Če zaostajaš, povečaj; če prehitevaš, zmanjšaj. Velja samo na tej napravi.
          </p>
        </div>
      )}
    </div>
  );
}
