"use client";

import { usePersistentBool } from "@/lib/usePersistentBool";

// Razdelki domače strani (Obdobja, Žanri, Avtorji, Predstavljeno) so na
// telefonu zložljivi — klik na naslov skrije/pokaže vsebino, izbira ostane v
// localStorage (komadi:home:<ključ>). Na računalniku so vedno odprti.
export function useHomeSectionOpen(key: string) {
  return usePersistentBool(`komadi:home:${key}`, true);
}

// Razred za vsebino razdelka: zaprta skrita samo na telefonu.
export function homeSectionBodyClass(open: boolean) {
  return open ? "" : "hidden lg:block";
}

export default function HomeSectionHeading({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <h2 className="mb-2 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1.5 text-left lg:pointer-events-none"
      >
        {title}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-neutral-400 transition-transform lg:hidden ${open ? "" : "-rotate-90"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </h2>
  );
}
