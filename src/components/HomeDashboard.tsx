"use client";

import type { SharedJamItem, Song } from "@/types/song";

// Domača stran — pozdrav, statistika in desni stolpec (računalnik) v slogu
// prenove videza: steklene kartice v temni temi, velike tanke številke, barva
// samo kot pika. Vse iz stanja, ki ga Dashboard že ima (brez novih poizvedb).

const CARD =
  "rounded-2xl border border-neutral-200 bg-white dark:rounded-[26px] dark:border-white/[0.08] dark:bg-white/[0.035]";

function greetingFor(hour: number) {
  if (hour < 5) return "Dober večer";
  if (hour < 10) return "Dobro jutro";
  if (hour < 18) return "Dober dan";
  return "Dober večer";
}

function skladbe(n: number) {
  const m = n % 100;
  if (m === 1) return "skladba";
  if (m === 2) return "skladbi";
  if (m === 3 || m === 4) return "skladbe";
  return "skladb";
}

export function HomeGreeting({ firstName, songCount }: { firstName: string; songCount: number }) {
  const now = new Date();
  const date = now.toLocaleDateString("sl-SI", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="mb-4">
      <h2 className="text-3xl font-light tracking-tight text-neutral-900 lg:text-4xl dark:font-extralight dark:text-white">
        {greetingFor(now.getHours())}
        {firstName && <span className="text-neutral-400 dark:text-neutral-500">, {firstName}</span>}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {date} · {songCount} {skladbe(songCount)} v knjižnici
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  dot,
  pulse,
  onClick,
  className = "",
}: {
  label: string;
  value: number;
  suffix?: string;
  dot: string;
  pulse?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-3 block text-4xl font-light tabular-nums text-neutral-900 dark:font-extralight dark:text-white">
        {value}
        {suffix && <span className="text-2xl text-neutral-400 dark:text-neutral-600">{suffix}</span>}
      </span>
      {onClick && <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-neutral-400 dark:text-neutral-600" />}
    </>
  );
  const cls = `${CARD} relative block p-4 text-left ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition hover:bg-neutral-50 dark:hover:bg-white/[0.06]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// Kartica-dejanje (Naključno, Novo, Filtri …): barvna ikona, naslov, opis;
// aktivna (odprt pogled / panel) je poudarjena z obrobo v barvi ikone.
function ActionCard({
  label,
  hint,
  icon,
  tone,
  active,
  onClick,
  disabled,
  viewToggle,
  row = false,
  className = "",
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: { text: string; ring: string; tint: string };
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  viewToggle?: boolean;
  // Vodoravna (nizka) kartica: ikona, besedilo in puščica v eni vrsti.
  row?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      {...(viewToggle ? { "data-view-toggle": true } : {})}
      className={`${CARD} group flex min-w-0 gap-3 p-3.5 text-left transition disabled:opacity-40 lg:p-4 ${
        row ? "flex-row items-center" : "flex-col justify-between"
      } ${
        active ? `ring-2 ${tone.ring} ${tone.tint}` : "hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
      } ${className}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] ${tone.text}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-neutral-900 dark:text-white">{label}</span>
        <span className="block truncate text-xs text-neutral-500">{hint}</span>
      </span>
      {row && <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-600" />}
    </button>
  );
}

// Barve novih kartic se ne ponavljajo s statistiko (siva, oranžna, turkizna,
// fuksija): Naključno vijolična, Delno limetina, Novo smaragdna, Popularno
// rožnata, Filtri modra, Uglaševalec jantarna.
const TONES = {
  violet: { text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/50", tint: "bg-violet-500/[0.06]" },
  lime: { text: "text-lime-600 dark:text-lime-400", ring: "ring-lime-500/50", tint: "bg-lime-500/[0.06]" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/50", tint: "bg-emerald-500/[0.06]" },
  rose: { text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/50", tint: "bg-rose-500/[0.06]" },
  blue: { text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/50", tint: "bg-blue-500/[0.06]" },
  amber: { text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/50", tint: "bg-amber-500/[0.06]" },
};

function filterCountLabel(n: number) {
  if (n === 1) return "1 aktiven";
  if (n === 2) return "2 aktivna";
  if (n < 5) return `${n} aktivni`;
  return `${n} aktivnih`;
}

// Mreža kartic domače strani: zgoraj 4 statistične (enake širine), spodaj
// dejanja različnih širin — računalnik 12 stolpcev (3·3·2·2·2), telefon 6
// (Naključno + Delno po pol, Novo / Popularno / Filtri po tretjino).
export function HomeBento({
  showStats,
  total,
  verified,
  review,
  jamCount,
  onOpenVerified,
  onOpenReview,
  onOpenJam,
  onRandom,
  onPartial,
  newestActive,
  popularActive,
  onToggleNewest,
  onTogglePopular,
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
  onOpenTuner,
  disabled,
  className = "",
}: {
  showStats: boolean;
  total: number;
  verified: number;
  review: number;
  jamCount: number;
  onOpenVerified: () => void;
  onOpenReview: () => void;
  onOpenJam: () => void;
  onRandom: () => void;
  onPartial: () => void;
  newestActive: boolean;
  popularActive: boolean;
  onToggleNewest: () => void;
  onTogglePopular: () => void;
  filtersOpen: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  onOpenTuner: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-6 gap-3 lg:grid-cols-12 ${className}`}>
      {showStats && (
        <>
          <StatCard className="col-span-3" label="Vse skladbe" value={total} dot="bg-neutral-400" />
          <StatCard className="col-span-3" label="Preverjeno špila" value={verified} suffix={`/${total}`} dot="bg-orange-400" onClick={onOpenVerified} />
          <StatCard className="col-span-3" label="V pregledu" value={review} dot="bg-teal-400" onClick={onOpenReview} />
          <StatCard className="col-span-3" label="V Skupnem Jamu" value={jamCount} dot="bg-fuchsia-400" pulse={jamCount > 0} onClick={onOpenJam} />
        </>
      )}
      <ActionCard
        className="col-span-3"
        label="Naključno"
        hint="ena skladba iz knjižnice"
        tone={TONES.violet}
        onClick={onRandom}
        disabled={disabled}
        icon={
          <>
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <path d="M16 8h.01" />
            <path d="M8 8h.01" />
            <path d="M8 16h.01" />
            <path d="M16 16h.01" />
            <path d="M12 12h.01" />
          </>
        }
      />
      <ActionCard
        className="col-span-3"
        label="Delno naključno"
        hint="po žanru, avtorju, obdobju …"
        tone={TONES.lime}
        onClick={onPartial}
        disabled={disabled}
        icon={
          <>
            <path d="m18 14 4 4-4 4" />
            <path d="m18 2 4 4-4 4" />
            <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
            <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
            <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
          </>
        }
      />
      <ActionCard
        className="col-span-2"
        label="Novo"
        hint="zadnje dodane"
        tone={TONES.emerald}
        active={newestActive}
        onClick={onToggleNewest}
        disabled={disabled}
        viewToggle
        icon={
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </>
        }
      />
      <ActionCard
        className="col-span-2"
        label="Popularno"
        hint="največkrat odprte"
        tone={TONES.rose}
        active={popularActive}
        onClick={onTogglePopular}
        disabled={disabled}
        viewToggle
        icon={<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />}
      />
      <ActionCard
        className="col-span-2"
        label="Filtri"
        hint={activeFilterCount ? filterCountLabel(activeFilterCount) : "žanr, obdobje …"}
        tone={TONES.blue}
        active={filtersOpen}
        onClick={onToggleFilters}
        icon={<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />}
      />
      <ActionCard
        className="col-span-6 lg:col-span-12"
        row
        label="Uglaševalec"
        hint="uglasi kitaro z mikrofonom"
        tone={TONES.amber}
        onClick={onOpenTuner}
        icon={
          <>
            <path d="M4.5 16a8 8 0 1 1 15 0" />
            <path d="M12 12l3.5-4" />
            <circle cx="12" cy="12" r="1.5" />
            <path d="M5 20h14" />
          </>
        }
      />
    </div>
  );
}

// Preverjene skladbe po dnevih zadnjih 30 dni (stolpci) + skupaj ta mesec.
function VerifiedChart({ songs }: { songs: Song[] }) {
  const days = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = Array.from({ length: days }, () => 0);
  let thisMonth = 0;
  for (const s of songs) {
    if (!s.verified_player_at) continue;
    const d = new Date(s.verified_player_at);
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) thisMonth++;
    d.setHours(0, 0, 0, 0);
    const ago = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (ago >= 0 && ago < days) counts[days - 1 - ago]++;
  }
  const max = Math.max(1, ...counts);
  return (
    <div className={`${CARD} p-4`}>
      <div className="text-xs text-neutral-500">Preverjeno ta mesec</div>
      <div className="mt-1 text-4xl font-light tabular-nums text-neutral-900 dark:font-extralight dark:text-white">
        {thisMonth}
        <span className="text-xl text-neutral-400 dark:text-neutral-600"> {skladbe(thisMonth)}</span>
      </div>
      <div className="mt-4 flex h-14 items-end gap-[3px]" title="Zadnjih 30 dni">
        {counts.map((c, i) => (
          <span
            key={i}
            style={{ height: `${c ? Math.max(12, (c / max) * 100) : 4}%` }}
            className={`flex-1 rounded-sm ${c ? "bg-orange-400/80 dark:bg-white/60" : "bg-neutral-200 dark:bg-white/10"}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-neutral-400 dark:text-neutral-600">
        <span>pred 30 dnevi</span>
        <span>danes</span>
      </div>
    </div>
  );
}

function Notice({ tone, title, text, onClick }: { tone: "red" | "teal"; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
        tone === "red"
          ? "border-red-500/25 bg-red-500/[0.06] hover:bg-red-500/10"
          : "border-neutral-200 hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
      }`}
    >
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone === "red" ? "bg-red-500" : "bg-teal-400"}`} />
      <span className="min-w-0">
        <span className="block text-sm text-neutral-800 dark:text-neutral-100">{title}</span>
        <span className="block text-xs text-neutral-500">{text}</span>
      </span>
    </button>
  );
}

export function HomeAside({
  jamItems,
  reviewCount,
  reportCount,
  songs,
  onOpenJam,
  onOpenReview,
  onOpenFix,
  className = "",
}: {
  jamItems: SharedJamItem[];
  reviewCount: number;
  reportCount: number;
  songs: Song[];
  onOpenJam: () => void;
  onOpenReview: () => void;
  onOpenFix: () => void;
  className?: string;
}) {
  const queue = jamItems.filter((x) => !x.played).slice(0, 5);
  return (
    <aside className={`space-y-3 ${className}`}>
      <div className={`${CARD} p-4`}>
        <button type="button" onClick={onOpenJam} className="mb-2 flex w-full items-center justify-between text-left">
          <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-fuchsia-500 dark:text-fuchsia-400">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Skupni Jam
          </span>
          <ArrowUpRight className="h-4 w-4 text-neutral-400 dark:text-neutral-600" />
        </button>
        {queue.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-500">V Skupnem Jamu ni skladb.</p>
        ) : (
          <ol className="space-y-0.5">
            {queue.map((item, i) => (
              <li key={item.id} className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${i === 0 ? "bg-neutral-100 dark:bg-white/[0.06]" : ""}`}>
                <span className={`w-4 text-xs tabular-nums ${i === 0 ? "text-fuchsia-500 dark:text-fuchsia-300" : "text-neutral-400 dark:text-neutral-600"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-800 dark:text-neutral-100">{item.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {i === 0 ? "Trenutna skladba" : i === 1 ? "Naslednja" : item.author}
                  </span>
                </span>
                {i === 0 && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-fuchsia-400" />}
              </li>
            ))}
          </ol>
        )}
      </div>

      {(reportCount > 0 || reviewCount > 0) && (
        <div className={`${CARD} space-y-2 p-4`}>
          <div className="mb-1 text-sm text-neutral-700 dark:text-neutral-300">Za urediti</div>
          {reportCount > 0 && (
            <Notice tone="red" title={`${reportCount} ${skladbe(reportCount)} s prijavo napake`} text="Popravi skladbe" onClick={onOpenFix} />
          )}
          {reviewCount > 0 && (
            <Notice tone="teal" title={`${reviewCount} ${skladbe(reviewCount)} čaka na odobritev`} text="Pregled in odobritev" onClick={onOpenReview} />
          )}
        </div>
      )}

      <VerifiedChart songs={songs} />
    </aside>
  );
}

function ArrowUpRight({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
