"use client";

import { useMemo, useState } from "react";
import { topoRing } from "@/lib/backgroundPatterns";
import { openChordsViewer } from "@/lib/openChords";
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
  icon,
  hint,
  suffix,
  dot,
  pulse,
  onClick,
  disabled,
  className = "",
  decor,
}: {
  label: string;
  // Velika tanka številka; namesto nje lahko ikona (Naključno, Delno naključno).
  value?: number;
  icon?: React.ReactNode;
  hint?: string;
  suffix?: string;
  dot: string;
  pulse?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  // Okras v ozadju kartice (npr. plastnice v spodnjem desnem kotu).
  decor?: React.ReactNode;
}) {
  const body = (
    <>
      {decor && (
        // Okras v kotu: na računalniku samo ob prehodu z miško (telefon ga skrije sam).
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {decor}
        </span>
      )}
      <span className={`flex items-center gap-2 text-sm text-neutral-500 lg:text-[15px] dark:text-neutral-400 ${onClick ? "pr-5" : ""}`}>
        <span className={`h-1.5 w-1.5 shrink-0 lg:h-2 lg:w-2 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`} />
        <span className="truncate">{label}</span>
      </span>
      {icon ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" className="mt-3 block h-10 w-10 text-neutral-900 dark:text-white">
          {icon}
        </svg>
      ) : (
        <span className="mt-3 block text-4xl font-light tabular-nums text-neutral-900 dark:font-extralight dark:text-white">
          {value}
          {suffix && <span className="text-2xl text-neutral-400 dark:text-neutral-600">{suffix}</span>}
        </span>
      )}
      {onClick && <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-neutral-400 dark:text-neutral-600" />}
    </>
  );
  const cls = `${CARD} group relative isolate block overflow-hidden p-4 text-left ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} title={hint} className={`${cls} transition hover:bg-neutral-50 disabled:opacity-40 dark:hover:bg-white/[0.06]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// Kartica-dejanje (Novo, Popularno, Filtri …; Naključno in Delno sta StatCard z ikono): barvna ikona, naslov, opis;
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
  small = false,
  className = "",
  decor,
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
  // Manjše besedilo in ikona (polovični kartici Tuner / Lestvice na telefonu).
  small?: boolean;
  className?: string;
  // Okras v ozadju kartice (blag vzorec v spodnjem desnem kotu).
  decor?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      {...(viewToggle ? { "data-view-toggle": true } : {})}
      className={`${CARD} group relative isolate flex min-w-0 overflow-hidden text-left ${small ? "gap-2.5 p-3 lg:gap-3 lg:p-4" : "gap-3 p-3.5"} transition disabled:opacity-40 lg:p-4 ${
        row ? "flex-row items-center" : "flex-col justify-between"
      } ${
        active ? `ring-2 ${tone.ring} ${tone.tint}` : "hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
      } ${className}`}
    >
      {decor && (
        // Okras v kotu: na računalniku samo ob prehodu z miško (telefon ga skrije sam).
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          {decor}
        </span>
      )}
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] ${small ? "h-8 w-8 lg:h-11 lg:w-11" : "h-9 w-9 lg:h-11 lg:w-11"} ${tone.text}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={small ? "h-4 w-4 lg:h-6 lg:w-6" : "h-[18px] w-[18px] lg:h-6 lg:w-6"}>
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-neutral-900 dark:text-white ${small ? "text-sm lg:text-[15px]" : "text-[15px]"}`}>{label}</span>
        <span className={`block truncate text-neutral-500 ${small ? "text-[11px] lg:text-xs" : "text-xs"}`}>{hint}</span>
      </span>
      {row && <ArrowUpRight className={`shrink-0 text-neutral-400 dark:text-neutral-600 ${small ? "h-3.5 w-3.5 lg:h-4 lg:w-4" : "h-4 w-4"}`} />}
    </button>
  );
}

// Barve novih kartic se ne ponavljajo s statistiko (siva, oranžna, turkizna,
// fuksija): Naključno vijolična, Delno limetina (pikica), Novo smaragdna, Popularno
// rožnata, Filtri modra, Tuner jantarna, Lestvice indigo.
const TONES = {
  violet: { text: "text-violet-600 dark:text-violet-400", ring: "ring-violet-500/50", tint: "bg-violet-500/[0.06]" },
  lime: { text: "text-lime-600 dark:text-lime-400", ring: "ring-lime-500/50", tint: "bg-lime-500/[0.06]" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/50", tint: "bg-emerald-500/[0.06]" },
  rose: { text: "text-rose-600 dark:text-rose-400", ring: "ring-rose-500/50", tint: "bg-rose-500/[0.06]" },
  blue: { text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/50", tint: "bg-blue-500/[0.06]" },
  amber: { text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/50", tint: "bg-amber-500/[0.06]" },
  indigo: { text: "text-indigo-600 dark:text-indigo-400", ring: "ring-indigo-500/50", tint: "bg-indigo-500/[0.06]" },
  green: { text: "text-green-600 dark:text-green-400", ring: "ring-green-500/50", tint: "bg-green-500/[0.06]" },
  neutral: { text: "text-neutral-400 dark:text-neutral-500", ring: "ring-neutral-500/50", tint: "bg-neutral-500/[0.06]" },
};

function knownLabel(n: number) {
  const m100 = n % 100;
  if (m100 === 1) return `${n} skladba`;
  if (m100 === 2) return `${n} skladbi`;
  if (m100 === 3 || m100 === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

function ownSongLabel(n: number) {
  const m100 = n % 100;
  if (m100 === 1) return `${n} lastna skladba`;
  if (m100 === 2) return `${n} lastni skladbi`;
  if (m100 === 3 || m100 === 4) return `${n} lastne skladbe`;
  return `${n} lastnih skladb`;
}

function filterCountLabel(n: number) {
  if (n === 1) return "1 aktiven";
  if (n === 2) return "2 aktivna";
  if (n < 5) return `${n} aktivni`;
  return `${n} aktivnih`;
}

// Mreža kartic domače strani: zgoraj statistične (Vse / Preverjeno po pol vrstice
// na telefonu, V pregledu / Čakalna vrsta po pol; na računalniku še Playliste,
// vse tri po tretjino), spodaj
// dejanja različnih širin — računalnik 12 stolpcev (3·3·2·2·2), telefon 6
// (Naključno + Delno po pol, Novo / Popularno / Filtri po tretjino).
export function HomeBento({
  showStats,
  total,
  verified,
  review,
  playlistCount,
  queueCount,
  knownSongs,
  onOpenKnown,
  ownSongCount,
  onOpenWriter,
  onOpenVerified,
  onOpenAll,
  onOpenReview,
  onOpenQueue,
  onOpenPlaylists,
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
  onOpenScales,
  disabled,
  hideBelow = false,
  className = "",
}: {
  showStats: boolean;
  total: number;
  verified: number;
  review: number;
  playlistCount: number;
  queueCount: number;
  knownSongs: Song[];
  onOpenKnown: () => void;
  ownSongCount: number;
  onOpenWriter: () => void;
  onOpenVerified: () => void;
  onOpenAll: () => void;
  onOpenReview: () => void;
  onOpenQueue: () => void;
  onOpenPlaylists: () => void;
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
  onOpenScales: () => void;
  disabled?: boolean;
  hideBelow?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-6 gap-3 lg:grid-cols-12 ${className}`}>
      {showStats && (
        <>
          <StatCard className="col-span-3" label="Vse skladbe" value={total} dot="bg-neutral-400" onClick={onOpenAll} decor={<TopoCorner hover="deco:text-neutral-400/22 dark:deco:text-neutral-400/22" />} />
          <StatCard className="col-span-3" label="Preverjeno špila" value={verified} suffix={verified <= total ? `/${total}` : undefined} dot="bg-orange-400" onClick={onOpenVerified} decor={<VerifiedCorner hover="deco:text-orange-400/22 dark:deco:text-orange-400/22" />} />
          <StatCard className="col-span-3 lg:col-span-2" label="V pregledu" value={review} dot="bg-teal-400" onClick={onOpenReview} decor={<ChecklistCorner />} />
          <StatCard className="col-span-3 lg:col-span-2" label="Čakalna vrsta" value={queueCount} dot="bg-fuchsia-400" onClick={onOpenQueue} decor={<QueueCorner />} />
          {/* Playliste samo na računalniku (uporabnikova odločitev 2026-10-23). */}
          <StatCard className="col-span-2 max-lg:hidden" label="Playliste" value={playlistCount} dot="bg-yellow-400" onClick={onOpenPlaylists} decor={<PlaylistCorner />} />
        </>
      )}
      <StatCard
        className="col-span-3"
        label="Naključno"
        hint="ena skladba iz knjižnice"
        dot="bg-violet-400"
        decor={<DiceCorner />}
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
      <StatCard
        className="col-span-3"
        label="Delno naključno"
        hint="po žanru, avtorju, obdobju …"
        dot="bg-lime-400"
        decor={<ShuffleCorner />}
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
      {/* Telefon, odprt Novo / Popularno / Filtri: vsebina se odpre takoj pod gumbi,
          kartice pod njimi (Tuner, Lestvice, Znam, Pišem, Ponovi) so do zaprtja skrite. */}
      {!hideBelow && (
      <>
      <ActionCard
        className="col-span-3"
        row
        small
        label="Tuner"
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
      <ActionCard
        className="col-span-3"
        row
        small
        label="Lestvice"
        hint="pentatonike in lestvice"
        tone={TONES.indigo}
        onClick={onOpenScales}
        icon={
          <>
            <path d="M3 6h18M3 10h18M3 14h18M3 18h18" />
            <circle cx="7" cy="8" r="1.4" fill="currentColor" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" />
            <circle cx="17" cy="16" r="1.4" fill="currentColor" />
          </>
        }
      />
      {/* Desno od Tuner / Lestvice: "Znam" in "Pišem" (lastne skladbe, SongWriter.tsx). */}
      <ActionCard
        className="col-span-3"
        row
        small
        label="Znam"
        hint={knownSongs.length ? knownLabel(knownSongs.length) : "skladbe, ki jih znam"}
        tone={TONES.green}
        onClick={onOpenKnown}
        icon={
          <>
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
            <path d="m9 9.5 2 2 4-4" />
          </>
        }
      />
      <ActionCard
        className="col-span-3"
        row
        small
        label="Pišem"
        hint={ownSongCount ? ownSongLabel(ownSongCount) : "lastne skladbe"}
        tone={TONES.amber}
        onClick={onOpenWriter}
        icon={
          <>
            <path d="M12 20h9" />
            <path d="M16.38 3.62a2.12 2.12 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84.84-2.87a2 2 0 0 1 .5-.86z" />
          </>
        }
      />
      {/* "Ponovi": na telefonu čez celo širino pod Tuner; na računalniku v desnem stolpcu (HomeAside). */}
      <RepeatWidget className="col-span-6 lg:hidden" songs={knownSongs} onOpenKnown={onOpenKnown} />
      </>
      )}
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

// Razporeditev skladb po naključnem semenu (stabilna med izrisi, nova ob ↻).
function seededOrder(id: string, seed: number) {
  let h = seed | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  return (h ^ (h >>> 15)) >>> 0;
}

// "Ponovi": dve naključni skladbi s seznama "Znam" — da jih ne pozabim.
// Klik na skladbo odpre Akorde v aplikaciji (brez njih stran Znam), ↻ izbere drugi dve.
function RepeatWidget({ songs, onOpenKnown, className = "" }: { songs: Song[]; onOpenKnown: () => void; className?: string }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const picks = useMemo(
    () => [...songs].sort((a, b) => seededOrder(a.id, seed) - seededOrder(b.id, seed)).slice(0, 2),
    [songs, seed],
  );
  return (
    <div className={`${CARD} relative isolate overflow-hidden p-4 ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 -z-10 h-36 w-36 rounded-full bg-green-500/[0.10] blur-2xl dark:bg-green-400/[0.08]" />
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={onOpenKnown} className="flex items-center gap-2 text-left text-sm text-neutral-700 dark:text-neutral-300">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-green-600 dark:text-green-400">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
          Ponovi
        </button>
        <span className="flex items-center gap-1">
          {songs.length > 2 && (
            <button
              type="button"
              onClick={() => setSeed((s) => (s * 48271 + 1) % 2147483647)}
              title="Drugi dve"
              aria-label="Drugi dve"
              className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-green-600 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-green-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          )}
          <button type="button" onClick={onOpenKnown} aria-label="Odpri Znam" className="p-1">
            <ArrowUpRight className="h-4 w-4 text-neutral-400 dark:text-neutral-600" />
          </button>
        </span>
      </div>
      {picks.length === 0 ? (
        <p className="px-1 py-2 text-xs text-neutral-500">Ko skladbo v meniju kartice označiš z »Znam«, jo bom tu občasno predlagal za ponovitev.</p>
      ) : (
        <ul className="space-y-1.5">
          {picks.map((song) => (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => (song.chords_text ? openChordsViewer(song.id) : onOpenKnown())}
                className="group flex w-full items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/[0.05] px-2.5 py-2 text-left transition hover:border-green-500/40 hover:bg-green-500/[0.09]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-green-700 dark:text-green-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-800 dark:text-neutral-100">{song.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{song.author}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-green-600/0 transition group-hover:text-green-600 dark:group-hover:text-green-400">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HomeAside({
  jamItems,
  reviewCount,
  reportCount,
  songs,
  knownSongs,
  onOpenJam,
  onOpenReview,
  onOpenFix,
  onOpenKnown,
  className = "",
}: {
  jamItems: SharedJamItem[];
  reviewCount: number;
  reportCount: number;
  songs: Song[];
  knownSongs: Song[];
  onOpenJam: () => void;
  onOpenReview: () => void;
  onOpenFix: () => void;
  onOpenKnown: () => void;
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

      <RepeatWidget songs={knownSongs} onOpenKnown={onOpenKnown} />

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

// Plastnice (kot vzorec ozadja "Plastnice") v spodnjem desnem kotu kartice.
// hover = barva vzorca ob prehodu z miško (ista kot krogec kartice).
function TopoCorner({ hover }: { hover: string }) {
  // Središče izven kartice (desno spodaj), zato se vidijo le loki v kotu.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 120"
      preserveAspectRatio="xMaxYMax meet"
      className={`pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] transition-colors duration-300 dark:text-white/[0.045] ${hover}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {Array.from({ length: 6 }, (_, i) => (
          <path key={i} d={topoRing(175, 135, 14 + i * 15, 1.7 + i * 0.22)} />
        ))}
      </g>
    </svg>
  );
}

// Preverjeno špila: znak "preverjeno" — kljukica v krogu, okrog nje valovi
// (kot da skladba igra); ob prehodu kljukica oranžna, valovi
// izmenično oranžni in beli. Na telefonu (hover:none) vzorcev v kotih ni.
function VerifiedCorner({ hover }: { hover: string }) {
  const cx = 128;
  const cy = 92;
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className={`pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045] transition-colors duration-300 ${hover}`}>
      <g fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        {[22, 36, 50, 64].map((r, i) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            stroke="currentColor"
            className={`transition-colors duration-300 ${i === 0 ? "" : i % 2 ? "deco:text-neutral-900/12 dark:deco:text-white/14" : "deco:text-orange-400/22"}`}
          />
        ))}
        <path d={`M ${cx - 9} ${cy} l 6 6 l 12 -13`} stroke="currentColor" className="transition-colors duration-300 deco:text-orange-400/30" />
      </g>
    </svg>
  );
}

// V pregledu: kontrolni seznam (vrstice s kvadratki in kljukicami) v kotu;
// ob prehodu kljukice turkizne, vrstice bele.
function ChecklistCorner() {
  const rows = [0, 1, 2, 3];
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045]">
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        {rows.map((i) => {
          const y = 34 + i * 24;
          const x = 66 + i * 6;
          return (
            <g key={i}>
              <rect x={x} y={y - 7} width={14} height={14} rx={3} stroke="currentColor" className="transition-colors duration-300 deco:text-neutral-900/12 dark:deco:text-white/14" />
              {i < 3 && (
                <path d={`M${x + 3} ${y} l3.5 3.5 l6 -7`} stroke="currentColor" className="transition-colors duration-300 deco:text-teal-400/25" />
              )}
              <path d={`M${x + 22} ${y} H 172`} stroke="currentColor" className="transition-colors duration-300 deco:text-neutral-900/12 dark:deco:text-white/14" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// Čakalna vrsta: stopnišče vrstic s pikicami (skladbe, ki čakajo) v kotu;
// ob prehodu vrstice bele, pikice fuksija.
function QueueCorner() {
  const rows = [0, 1, 2, 3];
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045]">
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke">
        {rows.map((i) => {
          const y = 34 + i * 24;
          const x = 84 - i * 6;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={4} stroke="currentColor" className="transition-colors duration-300 deco:text-fuchsia-400/28" />
              <path d={`M${x + 12} ${y} H 172`} stroke="currentColor" className="transition-colors duration-300 deco:text-neutral-900/12 dark:deco:text-white/14" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// Playliste: velika ikona playliste (ista kot v glavni navigaciji) v kotu;
// ob prehodu vrstice bele, nota rumena.
function PlaylistCorner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045]">
      <g transform="translate(66 22) scale(4.4)" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        <g className="transition-colors duration-300 deco:text-neutral-900/12 dark:deco:text-white/14">
          <path d="M16 6H3" vectorEffect="non-scaling-stroke" />
          <path d="M12 12H3" vectorEffect="non-scaling-stroke" />
          <path d="M12 18H3" vectorEffect="non-scaling-stroke" />
        </g>
        <g className="transition-colors duration-300 deco:text-yellow-400/28">
          <path d="M21 15V6" vectorEffect="non-scaling-stroke" />
          <circle cx="18.5" cy="15.5" r="2.5" vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </svg>
  );
}

// Naključno: raztresene kocke s pikami; ob prehodu izmenično vijolična in bela.
const DICE = [
  { x: 112, y: 70, s: 40, rot: 18, pips: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]] },
  { x: 70, y: 86, s: 30, rot: -14, pips: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]] },
  { x: 132, y: 22, s: 26, rot: -30, pips: [[0.5, 0.5]] },
];
function DiceCorner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045]">
      <g fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {DICE.map((d, i) => (
          <g
            key={i}
            transform={`rotate(${d.rot} ${d.x + d.s / 2} ${d.y + d.s / 2})`}
            stroke="currentColor"
            className={`transition-colors duration-300 ${i % 2 ? "deco:text-neutral-900/12 dark:deco:text-white/14" : "deco:text-violet-400/25"}`}
          >
            <rect x={d.x} y={d.y} width={d.s} height={d.s} rx={d.s * 0.18} stroke="currentColor" />
            {d.pips.map(([px, py], j) => (
              <circle key={j} cx={d.x + px * d.s} cy={d.y + py * d.s} r={d.s * 0.07} stroke="currentColor" />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

// Delno naključno: prekrižane puščice "premešaj"; ob prehodu limetina in bela.
function ShuffleCorner() {
  const paths = [
    "M 40 100 C 90 100, 100 40, 150 40",
    "M 40 40 C 90 40, 100 100, 150 100",
    "M 60 70 C 95 70, 110 70, 150 70",
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 160 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 -z-10 h-full w-1/2 [@media(hover:none)]:hidden text-neutral-900/[0.05] dark:text-white/[0.045]">
      <g fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
        {paths.map((d, i) => {
          const y = [40, 100, 70][i];
          return (
            <g
              key={i}
              stroke="currentColor"
              className={`transition-colors duration-300 ${i % 2 ? "deco:text-neutral-900/12 dark:deco:text-white/14" : "deco:text-lime-400/25"}`}
            >
              <path d={d} stroke="currentColor" />
              <path d={`M 142 ${y - 7} L 150 ${y} L 142 ${y + 7}`} stroke="currentColor" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function ArrowUpRight({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
