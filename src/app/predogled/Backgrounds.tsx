"use client";

import { useState } from "react";
import { BACKGROUND_COLORS, DEFAULT_PATTERN, PATTERNS, PatternSvg, type PatternId } from "@/lib/backgroundPatterns";

// Predogled ozadij — isti vzorci kot v aplikaciji (⋮ → Nastavitve → Tema → Vzorec).
export default function Backgrounds() {
  const [bg, setBg] = useState<PatternId>(DEFAULT_PATTERN);
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <PatternSvg id={bg} colors={BACKGROUND_COLORS} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/60 p-1 shadow-2xl backdrop-blur-xl [scrollbar-width:none]">
          <span className="hidden shrink-0 items-center px-3 text-xs text-neutral-500 sm:flex">Ozadje</span>
          {PATTERNS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setBg(o.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
                bg === o.id ? "bg-white/15 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
