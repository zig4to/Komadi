"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type JamTarget = "private" | "shared";

// Mini meni "Dodaj v Jam": osebni ali Skupni Jam. Portal (kartica priljubljenih
// ima overflow-hidden), pozicioniran pod gumbom; data-view-portal, da klik ne
// zapre pogleda Novo/Popularno (glej CLAUDE.md).
export default function JamTargetMenu({
  anchor,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  onPick: (target: JamTarget) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onCloseRef.current, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onCloseRef.current, { capture: true });
    };
  }, []);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 200));
  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-view-portal
      style={{ top: anchor.bottom + 4, left }}
      className="fixed z-50 w-48 space-y-0.5 rounded-xl border border-fuchsia-500/40 bg-white p-1.5 shadow-xl dark:border-fuchsia-400/40 dark:bg-neutral-900"
    >
      <JamTargetItems onPick={onPick} />
    </div>,
    document.body,
  );
}

// Obe možnosti (tudi v meniju SongCard.tsx).
export function JamTargetItems({ onPick }: { onPick: (target: JamTarget) => void }) {
  const item =
    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-neutral-100 dark:text-violet-400 dark:hover:bg-neutral-800";
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPick("private");
        }}
        className={item}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] shrink-0">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        Dodaj v privat Jam
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPick("shared");
        }}
        className={item}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] shrink-0">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Dodaj v Skupni Jam
      </button>
    </>
  );
}
