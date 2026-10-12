"use client";

// Izbira načina dodajanja po kliku na "+" (Dashboard.tsx): tri kartice v slogu
// domače strani (ikona v barvnem kvadratku, naslov, opis, puščica) —
// Glasovno, Hitro, Prek telefona (celoten obrazec).

const CARD =
  "group flex min-w-0 items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left transition hover:bg-neutral-50 lg:p-4 dark:rounded-[22px] dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:bg-white/[0.06]";

function ChoiceCard({
  label,
  hint,
  colorClass,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  colorClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={CARD}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] ${colorClass}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          {children}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-neutral-900 dark:text-white">{label}</span>
        <span className="block truncate text-xs text-neutral-500">{hint}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-600">
        <path d="M7 17 17 7M7 7h10v10" />
      </svg>
    </button>
  );
}

export default function AddChoiceIcons({
  onVoice,
  onQuick,
  onPhone,
}: {
  onVoice: () => void;
  onQuick: () => void;
  onPhone: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
      <ChoiceCard label="Glasovno" hint="nareki izvajalca in naslov" colorClass="text-sky-600 dark:text-sky-400" onClick={onVoice}>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <path d="M12 18v4" />
      </ChoiceCard>
      <ChoiceCard label="Hitro" hint="naslov in izvajalec v čakalno vrsto" colorClass="text-fuchsia-600 dark:text-fuchsia-400" onClick={onQuick}>
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </ChoiceCard>
      <ChoiceCard label="Prek telefona" hint="celoten obrazec z vsemi podatki" colorClass="text-emerald-600 dark:text-emerald-400" onClick={onPhone}>
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
        <path d="M11 18h2" />
      </ChoiceCard>
    </div>
  );
}
