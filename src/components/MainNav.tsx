"use client";

// Glavna navigacija (tabletke): Domov · Jam · Playliste · Skupno. Na
// računalniku v glavi domače strani, na telefonu (in na računalniku na
// celozaslonskih straneh) kot vrstica pod glavo. Ikone obdržijo barvo
// funkcije, aktivna tabletka je poudarjena.

export type MainNavTab = "home" | "jam" | "playlists" | "shared";

const TABS: { id: MainNavTab; label: string; color: string; icon: React.ReactNode }[] = [
  {
    id: "home",
    label: "Domov",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </>
    ),
  },
  {
    id: "jam",
    label: "Jam",
    color: "text-fuchsia-600 dark:text-fuchsia-400",
    icon: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  },
  {
    id: "playlists",
    label: "Playliste",
    color: "text-yellow-600 dark:text-yellow-400",
    icon: (
      <>
        <path d="M16 6H3" />
        <path d="M12 12H3" />
        <path d="M12 18H3" />
        <path d="M21 15V6" />
        <circle cx="18.5" cy="15.5" r="2.5" />
      </>
    ),
  },
  {
    id: "shared",
    label: "Skupno",
    color: "text-sky-600 dark:text-sky-400",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
];

export default function MainNav({
  active,
  onSelect,
  disabled,
  className = "",
}: {
  active: MainNavTab | null;
  onSelect: (tab: MainNavTab) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="Glavna navigacija"
      className={`flex items-center gap-1 rounded-full border border-neutral-200 bg-white/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.03] ${className}`}
    >
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            data-view-toggle
            onClick={() => onSelect(t.id)}
            disabled={disabled}
            aria-current={on ? "page" : undefined}
            className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 lg:flex-none lg:px-3.5 ${
              on
                ? "bg-neutral-900 font-medium text-white dark:bg-white/[0.12] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.05] dark:hover:text-neutral-200"
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
              className={`h-4 w-4 shrink-0 ${t.color}`}
            >
              {t.icon}
            </svg>
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
