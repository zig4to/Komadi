"use client";

import { useState } from "react";
import { ERA_IMAGES } from "@/lib/constants";

// Predogled novega videza ("Vexto" slog): grafitno ozadje, steklene kartice,
// tanka velika pisava, barva samo kot majhen poudarek. Izmišljeni podatki,
// brez prijave in Supabase. Aplikacija sama se ne spreminja.

const GLASS = "rounded-[20px] border border-white/[0.08] bg-white/[0.035]";
const LABEL = "text-[11px] tracking-wide text-neutral-500";

type DemoSong = {
  title: string;
  author: string;
  genre: string;
  era: keyof typeof ERA_IMAGES;
  chords?: boolean;
  player?: boolean;
};

const SONGS: DemoSong[] = [
  { title: "Bad Moon Rising", author: "Creedence Clearwater Revival", genre: "Rock", era: "Pred 1960", chords: true, player: true },
  { title: "Where Is My Mind?", author: "Pixies", genre: "Alternativa", era: "1980s", chords: true, player: true },
  { title: "Ti si mi u krvi", author: "Zdravko Čolić", genre: "Pop", era: "1980s", chords: true },
  { title: "Water Witch", author: "Jesse Welles", genre: "Folk", era: "2020s", player: true },
  { title: "Fast Car", author: "Tracy Chapman", genre: "Folk", era: "1980s", chords: true, player: true },
  { title: "Pumped Up Kicks", author: "Foster the People", genre: "Indie", era: "2010s" },
  { title: "Come On Eileen", author: "Dexys Midnight Runners", genre: "Pop", era: "1980s", chords: true },
  { title: "One Step Forward", author: "The Desert Rose Band", genre: "Country", era: "1980s", player: true },
  { title: "Killer Queen", author: "Queen", genre: "Rock", era: "1970s", chords: true, player: true },
  { title: "Happy Xmas (War Is Over)", author: "John Lennon", genre: "Pop", era: "1970s" },
  { title: "Lake of Fire", author: "Nirvana", genre: "Grunge", era: "1990s", chords: true },
  { title: "99 Problems", author: "Hugo", genre: "Indie", era: "2010s" },
];

const TABS = ["Domov", "Jam", "Playliste", "Skupno"] as const;

export default function Predogled() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Domov");
  const [favPage, setFavPage] = useState(0);
  const favPages = Math.ceil(SONGS.length / 9);
  const [menuOpen, setMenuOpen] = useState(true);
  const [chordsOpen, setChordsOpen] = useState(true);

  return (
    <>

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-4 lg:pt-6">
        {/* Glava */}
        <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center gap-3 px-4 py-3 backdrop-blur-xl lg:static lg:mx-0 lg:px-0 lg:backdrop-blur-none">
          <div className="flex items-center gap-2.5">
            <GuitarIcon className="h-6 w-6 text-neutral-200" />
            <span className="text-xl font-light tracking-tight text-white">Bitne Tabs</span>
          </div>

          <nav className="ml-4 hidden items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] p-1 lg:flex">
            {TABS.map((t) => (
              <PillTab key={t} active={t === tab} onClick={() => setTab(t)}>
                {t}
              </PillTab>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <label className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-sm text-neutral-500 sm:flex">
              <SearchIcon className="h-4 w-4" />
              <input placeholder="Išči skladbo ali avtorja" className="w-44 bg-transparent text-neutral-200 outline-none placeholder:text-neutral-500 lg:w-56" />
              <kbd className="rounded-md border border-white/10 px-1.5 text-[10px] text-neutral-500">/</kbd>
            </label>
            <IconButton label="Dodaj skladbo">
              <PlusIcon className="h-4 w-4" />
            </IconButton>
            <IconButton label="Meni">
              <DotsIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        {/* Tabletke na telefonu: vodoravno drsenje. */}
        <nav className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden">
          {TABS.map((t) => (
            <PillTab key={t} active={t === tab} onClick={() => setTab(t)}>
              {t}
            </PillTab>
          ))}
        </nav>

        <h1 className="mb-1 text-4xl font-extralight tracking-tight text-white lg:text-5xl">Dober večer</h1>
        <p className="mb-6 text-sm text-neutral-500">nedelja, 11. oktober · 294 skladb v knjižnici</p>

        {/* Statistika */}
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Vse skladbe" value="294" dot="bg-neutral-400" />
          <StatCard label="Preverjeno špila" value="41" suffix="/294" dot="bg-orange-400" />
          <StatCard label="V pregledu" value="6" dot="bg-teal-400" warn />
          <StatCard label="V Jamu zdaj" value="3" dot="bg-fuchsia-400" live />
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-8">
            {/* Priljubljeno */}
            <section>
              <SectionHeading icon={<StarIcon className="h-4 w-4 text-amber-400" />} title="Priljubljeno oktobra" count={SONGS.length} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SONGS.slice(favPage * 9, favPage * 9 + 9).map((s) => (
                  <CompactCard key={s.title} song={s} />
                ))}
              </div>
              <Pager page={favPage} pages={favPages} onPage={setFavPage} />
            </section>

            {/* Obdobja */}
            <section>
              <SectionHeading title="Obdobja" />
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
                {(["Pred 1960", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"] as const).slice(0, 4).map((era, i) => (
                  <EraCard key={era} era={era} count={[38, 52, 71, 46][i]} />
                ))}
              </div>
            </section>

            {/* Vsi komadi */}
            <section>
              <SectionHeading title="Vsi Komadi" count={294} />
              <div className="grid gap-3 lg:grid-cols-2">
                {SONGS.slice(0, 4).map((s, i) => (
                  <SongCard
                    key={s.title}
                    song={s}
                    menuOpen={i === 0 && menuOpen}
                    onMenu={() => setMenuOpen((v) => !v)}
                    chordsOpen={i === 1 && chordsOpen}
                    onChords={() => setChordsOpen((v) => !v)}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Desni stolpec: Jam in opozorila (kot "Warning" plošča na referenci). */}
          <aside className="space-y-3">
            <div className={`${GLASS} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-neutral-300">
                  <BoltIcon className="h-4 w-4 text-fuchsia-400" />
                  Skupni Jam
                </span>
                <span className="flex -space-x-1.5">
                  {["ŽP", "TB", "MK"].map((x) => (
                    <span key={x} className="flex h-6 w-6 items-center justify-center rounded-full border border-[#0a0a0b] bg-neutral-700 text-[9px] font-medium text-neutral-200">
                      {x}
                    </span>
                  ))}
                </span>
              </div>
              <ol className="space-y-1">
                {SONGS.slice(4, 8).map((s, i) => (
                  <li
                    key={s.title}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${i === 0 ? "bg-white/[0.06]" : ""}`}
                  >
                    <span className={`w-4 text-xs tabular-nums ${i === 0 ? "text-fuchsia-300" : "text-neutral-600"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-100">{s.title}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {i === 0 ? "Trenutna skladba" : i === 1 ? "Naslednja" : s.author}
                      </span>
                    </span>
                    {i === 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />}
                  </li>
                ))}
              </ol>
            </div>

            <div className={`${GLASS} p-4`}>
              <div className="mb-3 flex items-center justify-between text-sm text-neutral-300">
                Pregled in odobritev
                <ArrowUpRight className="h-4 w-4 text-neutral-500" />
              </div>
              <div className="space-y-2">
                <Notice tone="red" title="2 skladbi s prijavo napake" text="Popravi skladbe" />
                <Notice tone="teal" title="6 skladb čaka na odobritev" text="4 preverjene, 2 brez časov" />
              </div>
            </div>

            <div className={`${GLASS} p-4`}>
              <div className="flex items-end justify-between">
                <div>
                  <div className={LABEL}>Preverjeno ta mesec</div>
                  <div className="mt-1 text-4xl font-extralight text-white">
                    12<span className="text-neutral-600"> skladb</span>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-neutral-500" />
              </div>
              <Sparkline />
            </div>
          </aside>
        </div>

        {/* Meja: kar se spremeni (vrstica z gumbi) / kar ostane (besedilo). */}
        <section className="mt-12">
          <SectionHeading title="Akordi v aplikaciji" note="spremeni se samo zgornja vrstica, besedilo ostane kot zdaj" />
          <div className="overflow-hidden rounded-[20px] border border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-white/[0.04] px-3 py-2.5 backdrop-blur-xl">
              <span className="mr-2 min-w-0">
                <span className="block truncate text-sm text-white">Bad Moon Rising</span>
                <span className="block truncate text-xs text-neutral-500">Creedence Clearwater Revival · Capo 2</span>
              </span>
              <IconButton label="Predvajaj" small>
                <PlayIcon className="h-3.5 w-3.5" />
              </IconButton>
              <div className="flex min-w-[160px] flex-1 items-center gap-2">
                <div className="relative h-1 flex-1 rounded-full bg-white/10">
                  <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-white/70" />
                  <div className="absolute left-[38%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                </div>
                <span className="text-xs tabular-nums text-neutral-500">0:52 / 2:21</span>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-white/[0.08] p-0.5 text-xs text-neutral-300">
                <button className="rounded-full px-2.5 py-1 hover:bg-white/10">−</button>
                <span className="px-1 tabular-nums">0</span>
                <button className="rounded-full px-2.5 py-1 hover:bg-white/10">+</button>
              </div>
              <PillTab active={false}>Simpl</PillTab>
              <PillTab active={false}>A− A+</PillTab>
              <IconButton label="Nastavitve" small>
                <GearIcon className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            {/* Nespremenjen del: besedilo z akordi v trenutnem slogu (Antracit). */}
            <div className="bg-[#181818] px-5 py-4 font-mono text-[15px] leading-relaxed text-neutral-100">
              <div className="mb-1 text-sm text-amber-400">[Verse 1]</div>
              <ChordLine chords={["D", "A", "G", "D"]} />
              <div>I see the bad moon a-rising</div>
              <ChordLine chords={["D", "A", "G", "D"]} />
              <div className="-ml-2 pl-2 shadow-[inset_2px_0_0_#f97316] bg-white/[0.06]">I see trouble on the way</div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function PillTab({ active, onClick, children }: { active: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
        active
          ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, small, children }: { label: string; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-200 transition hover:bg-white/[0.1] ${
        small ? "h-8 w-8" : "h-9 w-9"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, suffix, dot, warn, live }: { label: string; value: string; suffix?: string; dot: string; warn?: boolean; live?: boolean }) {
  return (
    <div className={`${GLASS} relative p-4`}>
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${live ? "animate-pulse" : ""}`} />
        {label}
        {warn && <span className="ml-auto text-xs text-teal-300/80">!</span>}
      </div>
      <div className="mt-4 text-4xl font-extralight tabular-nums text-white lg:text-5xl">
        {value}
        {suffix && <span className="text-2xl text-neutral-600 lg:text-3xl">{suffix}</span>}
      </div>
      <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-neutral-600" />
    </div>
  );
}

function SectionHeading({ title, icon, count, note }: { title: string; icon?: React.ReactNode; count?: number; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="flex items-center gap-2 text-lg font-light text-white">
        {icon}
        {title}
      </h2>
      {count !== undefined && <span className="text-sm text-neutral-600">{count}</span>}
      {note && <span className="text-xs text-neutral-500">— {note}</span>}
    </div>
  );
}

function CompactCard({ song }: { song: DemoSong }) {
  return (
    <div className={`${GLASS} group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-white/[0.06]`}>
      <img src={ERA_IMAGES[song.era]} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover opacity-80 grayscale-[40%]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-100">{song.title}</span>
        <span className="block truncate text-xs text-neutral-500">{song.author}</span>
      </span>
      <VerifiedDots song={song} />
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-neutral-600 opacity-0 transition group-hover:opacity-100" />
    </div>
  );
}

function VerifiedDots({ song }: { song: DemoSong }) {
  return (
    <span className="flex shrink-0 gap-1">
      {song.chords && <span title="Akordi preverjeni" className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
      {song.player && <span title="Predvajalnik preverjen" className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
    </span>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages < 2) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <PagerArrow dir="left" disabled={page === 0} onClick={() => onPage(page - 1)} />
      <div className="flex gap-1.5">
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Stran ${i + 1}`}
            onClick={() => onPage(i)}
            className={`h-1 rounded-full transition-all ${i === page ? "w-5 bg-white/80" : "w-1.5 bg-white/20 hover:bg-white/40"}`}
          />
        ))}
      </div>
      <PagerArrow dir="right" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} />
    </div>
  );
}

function PagerArrow({ dir, disabled, onClick }: { dir: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "left" ? "Nazaj" : "Naprej"}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] text-neutral-400 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}

function EraCard({ era, count }: { era: keyof typeof ERA_IMAGES; count: number }) {
  const label = era === "Pred 1960" ? "60's" : era.replace(/^19/, "");
  return (
    <div className="relative h-40 w-44 shrink-0 overflow-hidden rounded-[20px] border border-white/[0.08] lg:w-auto">
      <img src={ERA_IMAGES[era]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 grayscale-[30%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-white/70" />
      <div className="absolute inset-x-2 bottom-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
        <div className="text-2xl font-extralight leading-none text-white">{label}</div>
        <div className="mt-1 text-[11px] text-neutral-300">{count} skladb</div>
      </div>
    </div>
  );
}

function SongCard({
  song,
  menuOpen,
  onMenu,
  chordsOpen,
  onChords,
}: {
  song: DemoSong;
  menuOpen: boolean;
  onMenu: () => void;
  chordsOpen: boolean;
  onChords: () => void;
}) {
  return (
    <div className={`${GLASS} relative isolate min-h-[132px] p-4 ${menuOpen || chordsOpen ? "z-10" : ""}`}>
      {/* Fotografija avtorja, zabledela v desno (kot avtobusi na referenci). */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-[20px]">
        <img
          src={ERA_IMAGES[song.era]}
          alt=""
          className="absolute inset-y-0 right-0 h-full w-[60%] object-cover opacity-35 grayscale-[50%] [mask-image:linear-gradient(to_right,transparent,black_60%)]"
        />
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-normal text-white">{song.title}</div>
          <button type="button" className="truncate text-sm text-neutral-400 hover:text-white">
            {song.author}
          </button>
        </div>
        <button
          type="button"
          onClick={onMenu}
          aria-label="Meni"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[song.genre, song.era === "Pred 1960" ? "60's" : song.era].map((t) => (
          <span key={t} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-neutral-300">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onChords}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.07] px-3.5 py-1.5 text-sm text-white backdrop-blur-md transition hover:bg-white/[0.12]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Akordi
        </button>
        <IconButton label="Poslušaj" small>
          <NoteIcon className="h-3.5 w-3.5" />
        </IconButton>
        <span className="ml-auto">
          <VerifiedDots song={song} />
        </span>
      </div>

      {menuOpen && (
        <GlassMenu className="right-3 top-12">
          <MenuItem>Uredi</MenuItem>
          <MenuItem dot="bg-fuchsia-400">Dodaj v Jam</MenuItem>
          <MenuItem dot="bg-yellow-400">Dodaj v playlisto</MenuItem>
          <MenuItem dot="bg-amber-400">Priljubljena</MenuItem>
          <MenuItem>Prijavi napako</MenuItem>
          <div className="my-1 h-px bg-white/[0.08]" />
          <MenuItem danger>Izbriši</MenuItem>
        </GlassMenu>
      )}
      {chordsOpen && (
        <GlassMenu className="left-3 top-[118px]">
          <MenuItem dot="bg-amber-400">Akordi v aplikaciji</MenuItem>
          <MenuItem dot="bg-orange-500">Sam Špili</MenuItem>
          <MenuItem>Ultimate Guitar</MenuItem>
          <MenuItem>Zabrenkaj.si</MenuItem>
          <MenuItem>PDF akordi</MenuItem>
          <div className="my-1 h-px bg-white/[0.08]" />
          <MenuItem>Spletno iskanje</MenuItem>
        </GlassMenu>
      )}
    </div>
  );
}

function GlassMenu({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div
      className={`absolute z-20 w-52 rounded-2xl border border-white/[0.1] bg-neutral-900/70 p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl ${className}`}
    >
      {children}
    </div>
  );
}

function MenuItem({ dot, danger, children }: { dot?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/[0.08] ${
        danger ? "text-red-400" : "text-neutral-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot ?? "bg-transparent"}`} />
      {children}
    </button>
  );
}

function Notice({ tone, title, text }: { tone: "red" | "teal"; title: string; text: string }) {
  const c = tone === "red" ? "border-red-500/25 bg-red-500/[0.07]" : "border-white/[0.08] bg-white/[0.03]";
  const dot = tone === "red" ? "bg-red-500" : "bg-teal-400";
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${c}`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0">
        <span className="block text-sm text-neutral-100">{title}</span>
        <span className="block text-xs text-neutral-500">{text}</span>
      </span>
    </div>
  );
}

function Sparkline() {
  const pts = [12, 18, 14, 22, 19, 28, 24, 31, 27, 35, 30, 38, 34, 42];
  const max = 45;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * 100},${40 - (p / max) * 40}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-14 w-full">
      <path d={`${d} L100,40 L0,40 Z`} fill="url(#sp)" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      <defs>
        <linearGradient id="sp" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ChordLine({ chords }: { chords: string[] }) {
  return (
    <div className="flex gap-8 font-semibold text-amber-300">
      {chords.map((c, i) => (
        <span key={i}>{c}</span>
      ))}
    </div>
  );
}

// --- ikone (tanke črte, kot na referenci) ---
type IconProps = { className: string };
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const ArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Svg>
);
const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const DotsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Svg>
);
const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
);
const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </Svg>
);
const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v16l13-8z" />
  </Svg>
);
const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Svg>
);
const GuitarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m11.9 12.1 4.514-4.514" />
    <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z" />
    <path d="m6 16 2 2" />
    <path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z" />
  </Svg>
);
