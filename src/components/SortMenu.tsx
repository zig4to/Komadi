"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SONG_SORTS = ["az", "newest", "za", "oldest", "author", "popular", "era-old", "era-new"] as const;
export type SongSort = (typeof SONG_SORTS)[number];

// Prvi dve (A–Ž, Novejši naprej) sta najpogostejši, ločeni s črto od ostalih.
const OPTIONS: { value: SongSort; label: string }[] = [
  { value: "az", label: "A – Ž" },
  { value: "newest", label: "Novejši naprej" },
  { value: "za", label: "Ž – A" },
  { value: "oldest", label: "Starejši naprej" },
  { value: "author", label: "Po izvajalcu" },
  { value: "popular", label: "Najbolj igrani" },
  { value: "era-old", label: "Obdobje: starejša" },
  { value: "era-new", label: "Obdobje: novejša" },
];

// Gumb "Filter" desno od naslova "Vsi Komadi" — odpre majhen meni (isti
// portal+pozicioniranje vzorec kot meni "Akordi" v ChordsButtons.tsx) za
// izbiro vrstnega reda seznama skladb.
export default function SortMenu({
  value,
  onChange,
}: {
  value: SongSort;
  onChange: (value: SongSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          if (!open) {
            const rect = e.currentTarget.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left });
          }
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Razvrsti"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-white/70 px-2 py-1 text-xs font-medium leading-none text-neutral-600 transition hover:border-amber-500 hover:text-amber-600 dark:border-amber-400/40 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:text-amber-400"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[13px] w-[13px] shrink-0"
        >
          <path d="M3 6h18" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        Filter
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            data-view-portal
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-40 space-y-0.5 rounded-xl border border-amber-400 bg-white p-1.5 shadow-xl dark:border-amber-400/70 dark:bg-neutral-900"
          >
            {OPTIONS.map((o, i) => (
              <div key={o.value}>
              {i === 2 && <div className="my-0.5 border-t border-neutral-200 dark:border-neutral-800" />}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-[13px] w-[13px] shrink-0 text-amber-500 ${value === o.value ? "" : "invisible"}`}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {o.label}
              </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
