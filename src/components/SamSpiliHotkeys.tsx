"use client";

import { useEffect, useState } from "react";
import { useBackableOpen } from "@/lib/useBackableOpen";

// Sam Špili, začetni zaslon (samo računalnik): gumb s tipkovnico odpre legendo
// bližnjic — tipkovnica (slovenska QWERTZ, glavni del + puščice + numerična)
// z označenimi tipkami in opis, kaj katera naredi. Lebdenje nad vrstico legende
// poudari njene tipke in obratno.

type Key = { id?: string; label: string; x: number; y: number; w?: number; h?: number };

// Enota = širina običajne tipke; glavni del 15 enot, puščice od 15,5, numerična od 19.
const row = (y: number, x0: number, keys: (string | [string, number])[]): Key[] => {
  let x = x0;
  return keys.map((k) => {
    const [label, w] = typeof k === "string" ? [k, 1] : k;
    const key = { label, x, y, w };
    x += w;
    return key;
  });
};

const KEYS: Key[] = [
  ...row(0, 0, ["¸", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "'", "+", ["Backspace", 2]]),
  ...row(1, 0, [["Tab", 1.5], "Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Š", "Đ"]),
  { label: "Enter", x: 13.5, y: 1, w: 1.5, h: 2 },
  ...row(2, 0, [["Caps", 1.5], "A", "S", "D", "F", "G", "H", "J", "K", "L", "Č", "Ć", "Ž"]),
  ...row(3, 0, [["Shift", 1.25], "<", "Y", "X", "C", "V", "B", "N", "M", ",", ".", "-", ["Shift", 2.75]]),
  ...row(4, 0, [["Ctrl", 1.25], ["Win", 1.25], ["Alt", 1.25], ["Preslednica", 6.25], ["AltGr", 1.25], ["Win", 1.25], ["Meni", 1.25], ["Ctrl", 1.25]]),
  ...row(0, 15.5, ["Ins", "Home", "PgUp"]),
  ...row(1, 15.5, ["Del", "End", "PgDn"]),
  { id: "up", label: "↑", x: 16.5, y: 3 },
  { id: "left", label: "←", x: 15.5, y: 4 },
  { id: "down", label: "↓", x: 16.5, y: 4 },
  { id: "right", label: "→", x: 17.5, y: 4 },
  ...row(0, 19, ["Num", "/", "*"]),
  { label: "−", x: 22, y: 0 },
  ...row(1, 19, ["7", "8", "9"]),
  { label: "+", x: 22, y: 1, h: 2 },
  ...row(2, 19, ["4", "5", "6"]),
  { id: "num1", label: "1", x: 19, y: 3 },
  ...row(3, 20, ["2", "3"]),
  { label: "Enter", x: 22, y: 3, h: 2 },
  { id: "num0", label: "0", x: 19, y: 4, w: 2 },
  { label: ",", x: 21, y: 4 },
].map((k) => {
  // Označene tipke glavnega dela: preslednica in desni Ctrl.
  if (k.label === "Preslednica") return { ...k, id: "space" };
  if (k.label === "Ctrl" && k.x > 10) return { ...k, id: "rctrl" };
  return k;
});

const LEGEND: { ids: string[]; keys: string; text: string; note?: string }[] = [
  { ids: ["space"], keys: "Preslednica", text: "Pavza / predvajaj", note: "ko so vrstice na zaslonu" },
  { ids: ["left", "right"], keys: "← / →", text: "5 s nazaj / naprej" },
  { ids: ["up", "down"], keys: "↑ / ↓", text: "Glasneje / tišje (po 5 %)" },
  { ids: ["num1"], keys: "Num 1", text: "Večje besedilo" },
  { ids: ["num0"], keys: "Num 0", text: "Manjše besedilo" },
  { ids: ["rctrl"], keys: "Desni Ctrl", text: "Na začetek skladbe", note: "ob spustu tipke" },
];

const UNITS_W = 23;
const UNITS_H = 5;

export default function SamSpiliHotkeys({ buttonClassName, label }: { buttonClassName: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string[] | null>(null);
  useBackableOpen(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const used = new Set(LEGEND.flatMap((l) => l.ids));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Bližnjice na tipkovnici"
        title="Bližnjice na tipkovnici"
        className={buttonClassName}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 lg:h-5 lg:w-5">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
        </svg>
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bližnjice na tipkovnici"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-5xl rounded-2xl border border-orange-400/50 bg-neutral-900 p-6 text-left font-sans text-neutral-100 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Bližnjice na tipkovnici</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zapri"
                title="Zapri (Esc)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tipkovnica: vsaka tipka absolutno v enotah (širina = 100 % / 23 enot). */}
            <div className="relative w-full" style={{ aspectRatio: `${UNITS_W} / ${UNITS_H}` }}>
              {KEYS.map((k, i) => {
                const isUsed = !!k.id && used.has(k.id);
                const isHover = !!k.id && !!hover?.includes(k.id);
                return (
                  <div
                    key={i}
                    onMouseEnter={isUsed ? () => setHover(LEGEND.find((l) => l.ids.includes(k.id!))!.ids) : undefined}
                    onMouseLeave={isUsed ? () => setHover(null) : undefined}
                    style={{
                      left: `${(k.x / UNITS_W) * 100}%`,
                      top: `${(k.y / UNITS_H) * 100}%`,
                      width: `${((k.w ?? 1) / UNITS_W) * 100}%`,
                      height: `${((k.h ?? 1) / UNITS_H) * 100}%`,
                    }}
                    className="absolute p-[0.2%]"
                  >
                    <div
                      className={`flex h-full w-full items-center justify-center rounded-md border text-[clamp(8px,1vw,13px)] leading-none transition ${
                        isHover
                          ? "border-orange-300 bg-orange-400 font-semibold text-neutral-900 shadow-[0_0_18px_rgba(251,146,60,0.55)]"
                          : isUsed
                            ? "cursor-default border-orange-400 bg-orange-400/15 font-semibold text-amber-300 shadow-[inset_0_-2px_0_rgba(251,146,60,0.35)]"
                            : "border-white/10 bg-white/[0.04] text-neutral-500 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]"
                      }`}
                    >
                      {k.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="mt-6 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {LEGEND.map((l) => {
                const active = hover === l.ids;
                return (
                  <li
                    key={l.keys}
                    onMouseEnter={() => setHover(l.ids)}
                    onMouseLeave={() => setHover(null)}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 transition ${active ? "bg-orange-400/10" : ""}`}
                  >
                    <span className="flex min-w-[9.5rem] flex-wrap gap-1">
                      {l.keys.split(" / ").map((part) => (
                        <kbd
                          key={part}
                          className="rounded-md border border-orange-400/70 bg-orange-400/15 px-2 py-0.5 font-sans text-xs font-semibold text-amber-300"
                        >
                          {part}
                        </kbd>
                      ))}
                    </span>
                    <span className="text-sm">
                      {l.text}
                      {l.note && <span className="ml-1 text-neutral-500">— {l.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
