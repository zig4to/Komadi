"use client";

import { useEffect, useRef, useState } from "react";
import ChordsButtons from "@/components/ChordsButtons";
import { authorAccentHex } from "@/lib/authorColor";
import { PORTRAIT_FOCUS_Y } from "@/lib/constants";
import type { Song } from "@/types/song";

// "Priljubljeno ta mesec" (domača stran, nad "Obdobja") in "Arhiv
// priljubljenih" (celostranski pogled iz menija ⋮). Mesec določa
// song.favorited_at — ob preklopu na nov mesec se lanske priljubljene same
// "preselijo" v arhiv, ničesar ni treba premikati v bazi.

// Kartic na stolpec v "swipe" pogledu na domači strani.
const COLUMN_SIZE = 3;
// Kartic na stran na računalniku (3 vrste × 3), polnijo se po vrstah.
const DESKTOP_PAGE_SIZE = 9;
const COLUMN_GAP_PX = 12; // gap-3

// "2026-09" — ključ meseca v lokalnem času.
export function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("sl-SI", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Rodilnik meseca za naslov "Priljubljeno septembra" (slovensko: male črke).
const MONTH_GENITIVE = ["januarja", "februarja", "marca", "aprila", "maja", "junija", "julija", "avgusta", "septembra", "oktobra", "novembra", "decembra"];

function currentMonthKey() {
  return monthKey(new Date().toISOString());
}

// Priljubljene, najnovejša označitev prva.
function favoritesSorted(songs: Song[]) {
  return songs
    .filter((s) => s.favorite && s.favorited_at)
    .sort((a, b) => b.favorited_at!.localeCompare(a.favorited_at!));
}

function StarIcon({ filled, className, strokeWidth = 1.8 }: { filled: boolean; className: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}

// Strnjena kartica priljubljene skladbe (ena vrstica): majhna slika avtorja
// levo (brez slike: kvadrat v barvi avtorja z začetnico), naslov/avtor/datum
// in pod njima gumba Akordi/Poslušaj na sredini, zvezdica za odstranitev desno.
export function FavoriteCard({
  song,
  authorImage,
  onToggleFavorite,
  onFilterAuthor,
  onChordsClick,
  onAddToJam,
}: {
  song: Song;
  authorImage: string | null;
  onToggleFavorite: (song: Song) => void;
  onFilterAuthor?: (author: string) => void;
  onChordsClick?: (song: Song) => void;
  onAddToJam?: (song: Song) => void;
}) {
  const accent = authorAccentHex(song.author);
  const [portraitSrc, setPortraitSrc] = useState<string | null>(null);
  const date = song.favorited_at ? new Date(song.favorited_at).toLocaleDateString("sl-SI", { day: "numeric", month: "short" }) : null;

  // Kratek vizualni znak (kljukica namesto strele), da je jasno, da je klik
  // na "Dodaj v Jam" nekaj naredil — enak vzorec kot na SongCard.tsx.
  const [jamAdded, setJamAdded] = useState(false);
  const jamAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (jamAddedTimer.current) clearTimeout(jamAddedTimer.current);
    },
    [],
  );

  return (
    <div
      style={{
        backgroundImage: `linear-gradient(100deg, ${accent}1f 0%, transparent 65%)`,
        borderColor: `${accent}38`,
        boxShadow: `0 8px 18px -14px ${accent}66`,
      }}
      className="relative isolate flex items-center gap-2.5 overflow-hidden rounded-xl border bg-white p-2 pr-12 dark:bg-[#111114]"
    >
      <div
        style={{ backgroundColor: `${accent}33`, color: accent }}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg font-bold"
      >
        {authorImage ? (
          <img
            src={authorImage}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalHeight > img.naturalWidth) setPortraitSrc(authorImage);
            }}
            style={{ objectPosition: portraitSrc === authorImage ? `center ${PORTRAIT_FOCUS_Y}` : "center" }}
            className="h-full w-full object-cover"
          />
        ) : (
          song.author.charAt(0).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-neutral-900 dark:text-neutral-100">{song.title}</p>
        <p className="flex min-w-0 items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => onFilterAuthor?.(song.author)}
            title={`Prikaži vse skladbe izvajalca ${song.author}`}
            className="truncate text-left hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
          >
            {song.author}
          </button>
          {date && <span className="shrink-0">· {date}</span>}
        </p>
        <span className="mt-1 inline-flex items-center gap-1">
          <ChordsButtons song={song} onChordsClick={onChordsClick} merged />
          {onAddToJam && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToJam(song);
                setJamAdded(true);
                if (jamAddedTimer.current) clearTimeout(jamAddedTimer.current);
                jamAddedTimer.current = setTimeout(() => setJamAdded(false), 1400);
              }}
              aria-label={jamAdded ? "Dodano v Jam" : "Dodaj v Jam"}
              title={jamAdded ? "Dodano v Jam" : "Dodaj v Jam"}
              className={`inline-flex shrink-0 items-center p-0.5 transition ${
                jamAdded
                  ? "text-emerald-500 dark:text-emerald-400"
                  : "text-fuchsia-500 hover:text-fuchsia-600 dark:text-fuchsia-400 dark:hover:text-fuchsia-300"
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
                className="h-[15px] w-[15px] shrink-0"
              >
                {jamAdded ? <path d="M20 6 9 17l-5-5" /> : <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />}
              </svg>
            </button>
          )}
        </span>
      </div>

      {/* Velika obrobna zvezda kot ikona v ozadju, ki jo desni rob kartice
          odreže (overflow-hidden). Klik odstrani iz priljubljenih. */}
      <button
        type="button"
        onClick={() => onToggleFavorite(song)}
        title="Odstrani iz priljubljenih"
        aria-label="Odstrani iz priljubljenih"
        className="absolute -right-5 top-1/2 -z-10 -translate-y-1/2 text-amber-500 opacity-20 transition hover:opacity-70 dark:text-amber-400"
      >
        <StarIcon filled={false} strokeWidth={1} className="h-14 w-14" />
      </button>
    </div>
  );
}

type CardHandlers = {
  authorImages: Record<string, string>;
  onToggleFavorite: (song: Song) => void;
  onFilterAuthor?: (author: string) => void;
  onChordsClick?: (song: Song) => void;
  onAddToJam?: (song: Song) => void;
};

function CardGrid({ songs, authorImages, ...handlers }: { songs: Song[] } & CardHandlers) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {songs.map((s) => (
        <FavoriteCard key={s.id} song={s} authorImage={authorImages[s.author] ?? null} {...handlers} />
      ))}
    </div>
  );
}

// Vodoravni "swipe" skupin kartic (stolpec na telefonu, stran 3 × 3 na
// računalniku): drsenje na dotik, vlečenje z miško, poravnava na skupino in
// pike — pike samo, če vse skupine ne gredo na zaslon.
function Swiper({
  groups,
  groupClassName,
  className = "",
  renderCard,
}: {
  groups: Song[][];
  groupClassName: string;
  className?: string;
  renderCard: (song: Song) => React.ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [visibleGroups, setVisibleGroups] = useState(1);
  const positions = Math.max(1, groups.length - visibleGroups + 1);
  // Vlečenje z miško (na dotik drsenje deluje samo po sebi); `moved` prepreči,
  // da bi spust po vlečenju sprožil klik na gumb v kartici.
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (first && first.offsetWidth > 0)
        setVisibleGroups(Math.max(1, Math.floor((el.clientWidth + COLUMN_GAP_PX) / (first.offsetWidth + COLUMN_GAP_PX))));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length]);

  function handleScroll() {
    const el = scrollerRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    setActive(Math.min(positions - 1, Math.round(el.scrollLeft / (first.offsetWidth + COLUMN_GAP_PX))));
  }

  function scrollToGroup(i: number) {
    const el = scrollerRef.current;
    const g = el?.children[i] as HTMLElement | undefined;
    if (el && g) el.scrollTo({ left: g.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }

  return (
    <div className={className}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          drag.current = { down: true, startX: e.clientX, startScroll: e.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current.down) return;
          const dx = e.clientX - drag.current.startX;
          if (Math.abs(dx) > 3) drag.current.moved = true;
          e.currentTarget.scrollLeft = drag.current.startScroll - dx;
        }}
        onPointerUp={() => {
          if (!drag.current.down) return;
          drag.current.down = false;
          if (drag.current.moved) scrollToGroup(active);
        }}
        onPointerLeave={() => {
          drag.current.down = false;
        }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.current.moved = false;
          }
        }}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {groups.map((g, i) => (
          <div key={i} className={`shrink-0 snap-start ${groupClassName}`}>
            {g.map(renderCard)}
          </div>
        ))}
      </div>

      {positions > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {Array.from({ length: positions }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToGroup(i)}
              aria-label={`Skupina ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-5 bg-amber-500" : "w-1.5 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Priljubljene tekočega meseca, od najstarejše do najnovejše. Telefon:
// stolpci po 3 (swipe levo/desno, viden rob naslednjega stolpca). Računalnik:
// strani 3 × 3, ki se polnijo po vrstah (prva vrsta, druga, tretja), nato
// naslednja stran desno.
export function FavoritesThisMonth({ songs, authorImages, ...handlers }: { songs: Song[] } & CardHandlers) {
  const key = currentMonthKey();
  const items = favoritesSorted(songs)
    .filter((s) => monthKey(s.favorited_at!) === key)
    .reverse();
  const renderCard = (s: Song) => (
    <FavoriteCard key={s.id} song={s} authorImage={authorImages[s.author] ?? null} {...handlers} />
  );

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
          <StarIcon filled className="h-[18px] w-[18px] text-amber-500 dark:text-amber-400" />
          Priljubljeno {MONTH_GENITIVE[Number(key.slice(5)) - 1]}
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/[0.04] px-4 py-3.5 text-sm text-neutral-600 dark:text-neutral-300">
          <StarIcon filled={false} className="h-5 w-5 shrink-0 text-amber-500" />
          <p>
            Ta mesec še ni priljubljenih. Skladbo dodaš v meniju kartice (☰) z gumbom{" "}
            <span className="font-medium">Priljubljena</span>.
          </p>
        </div>
      ) : (
        <>
          <Swiper
            className="lg:hidden"
            groups={chunk(items, COLUMN_SIZE)}
            groupClassName="flex w-[86%] flex-col gap-2 sm:w-[calc(50%-6px)]"
            renderCard={renderCard}
          />
          <Swiper
            className="hidden lg:block"
            groups={chunk(items, DESKTOP_PAGE_SIZE)}
            groupClassName="grid w-full grid-cols-3 content-start gap-x-3 gap-y-2"
            renderCard={renderCard}
          />
        </>
      )}
    </section>
  );
}

// Pretekli meseci (tekoči je na domači strani), najnovejši prvi.
export function favoriteArchiveMonths(songs: Song[]) {
  const current = currentMonthKey();
  const groups = new Map<string, Song[]>();
  for (const s of favoritesSorted(songs)) {
    const k = monthKey(s.favorited_at!);
    if (k === current) continue;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function FavoritesArchive({ songs, ...handlers }: { songs: Song[] } & CardHandlers) {
  const months = favoriteArchiveMonths(songs);

  if (months.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Arhiv je še prazen. Priljubljene tekočega meseca so na domači strani (razdelek »Priljubljeno« z imenom meseca); ob
        začetku novega meseca se preselijo sem.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {months.map(([key, list]) => (
        <section key={key}>
          <h2 className="mb-2 flex items-baseline gap-2 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {monthLabel(key)}
            <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">{list.length}</span>
          </h2>
          <CardGrid songs={list} {...handlers} />
        </section>
      ))}
    </div>
  );
}
