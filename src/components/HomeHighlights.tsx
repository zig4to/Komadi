"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { ERA_IMAGES } from "@/lib/constants";

// Ena preprosta, polnobarvna (solid) ikona na žanr — črne barve, prikazana
// pod ločilno črto na kartici. Ključi se morajo ujemati z GENRES v
// src/lib/constants.ts.
const GENRE_ICONS: Record<string, JSX.Element> = {
  Rock: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="7.8" y="0.5" width="3.6" height="2.2" rx="0.8" />
      <rect x="8.6" y="1.5" width="2" height="9.5" rx="1" />
      <ellipse cx="9.4" cy="11.2" rx="3.6" ry="3" />
      <ellipse cx="9.4" cy="17" rx="5.4" ry="4.2" />
    </svg>
  ),
  "Klasični rock": (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"
      />
    </svg>
  ),
  "Hard rock": (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  ),
  "Yugo rock": (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="9" y="0.5" width="4" height="1.8" rx="0.6" />
      <rect x="10.2" y="1.8" width="1.6" height="8.5" rx="0.8" />
      <polygon points="12,9 20,19 17,21 12,13 7,21 4,19" />
    </svg>
  ),
  Punk: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20h18l-3-9-3 5-3-11-3 11-3-5-3 9z" />
    </svg>
  ),
  Metal: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 3c-4.4 0-7 3-7 7 0 2.6 1.3 4.3 2.6 5.4-.3.9-.6 2.1-.6 2.6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1c0-.5-.3-1.7-.6-2.6C17.7 14.3 19 12.6 19 10c0-4-2.6-7-7-7zm-2.2 8a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z"
      />
    </svg>
  ),
  Pop: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 13a3 3 0 0 0 3-3V4a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V17H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.1A5 5 0 0 0 17 10z" />
    </svg>
  ),
  "Pop rock": (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
      <path d="M9 18V6.5l9-2v9.5h-1.6V6.3l-5.8 1.3V18H9z" />
    </svg>
  ),
  Indie: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zm5 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 10.5A1.5 1.5 0 1 1 8 13.5 1.5 1.5 0 0 1 8 10.5zm8 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
      />
    </svg>
  ),
  Blues: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C9 6.5 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7.5-6-12z" />
    </svg>
  ),
  Country: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <ellipse cx="12" cy="13" rx="10" ry="2.6" />
      <path d="M8 12c-.6-3 .5-8 4-8s4.6 5 4 8H8z" />
    </svg>
  ),
  Reggae: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
      <rect x="11" y="1" width="2" height="4" rx="1" />
      <rect x="11" y="19" width="2" height="4" rx="1" />
      <rect x="1" y="11" width="4" height="2" rx="1" />
      <rect x="19" y="11" width="4" height="2" rx="1" />
      <rect x="4" y="3.5" width="2" height="4" rx="1" transform="rotate(45 5 5.5)" />
      <rect x="18" y="16.5" width="2" height="4" rx="1" transform="rotate(45 19 18.5)" />
      <rect x="16.5" y="4" width="2" height="4" rx="1" transform="rotate(-45 17.5 6)" />
      <rect x="3.5" y="16" width="2" height="4" rx="1" transform="rotate(-45 4.5 18)" />
    </svg>
  ),
  "Balada / akustika": (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21s-7.5-4.6-10-9.3C.3 8.2 2 4.5 5.6 4c2-.3 3.7.7 4.4 2.2C10.7 4.7 12.4 3.7 14.4 4c3.6.5 5.3 4.2 3.6 7.7C15.5 16.4 12 21 12 21z" />
    </svg>
  ),
  Dalmatinske: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
      />
      <rect x="11" y="6" width="2" height="12" />
      <rect x="6" y="10" width="12" height="2" />
      <path d="M4 14a1 1 0 0 1 2 0 6 6 0 0 0 5 5.9V22a1 1 0 1 1-2 0v-.2A8 8 0 0 1 4 14zM20 14a1 1 0 0 0-2 0 6 6 0 0 1-5 5.9V22a1 1 0 1 0 2 0v-.2a8 8 0 0 0 5-7.8z"
      />
    </svg>
  ),
};

// "Dark neon" slog: skoraj črna kartica + en poudarjen (neonski) odtenek na
// kartico za žarenje v vogalu, rob in senco. Barve ponovno uporabljajo
// obstoječe accent barve aplikacije (emerald/violet/cyan/orange/rose/blue/
// amber/fuchsia), le da tu nastopajo kot žarek, ne kot poln gradient.
export const ACCENTS: string[] = [
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#fb7185", // rose
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#e879f9", // fuchsia
];

// Ločen (premešan) vrstni red indeksov v paleto za vsako vrstico, da se
// barve žanrov ne ujemajo ena za ena z barvami obdobij.
const ERA_COLOR_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
const GENRE_COLOR_ORDER = [5, 2, 7, 0, 4, 1, 6, 3];

// "1960s" -> "60's", "2000s" -> "2000's", "Pred 1960" -> "Pred 60's" —
// apostrof pred "s" povsod (kot na referenčni sliki); 19XXs se dodatno
// skrajša na zadnji dve števki.
export function formatEraLabel(era: string): string {
  if (era === "Pred 1960") return "60's";
  const m = era.match(/^(\d+)s$/);
  if (!m) return era;
  const digits = m[1];
  return digits.startsWith("19") ? `${digits.slice(2)}'s` : `${digits}'s`;
}

// Slovensko sklanjanje: 1 skladba, 2 skladbi, 3-4 skladbe, 5+ skladb.
function skladbeLabel(n: number): string {
  const mod100 = n % 100;
  if (mod100 === 1) return `${n} skladba`;
  if (mod100 === 2) return `${n} skladbi`;
  if (mod100 === 3 || mod100 === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

export interface HighlightItem {
  label: string;
  count: number;
}

const DEFAULT_COLOR_ORDER = ACCENTS.map((_, i) => i);

export function HighlightRow({
  title,
  items,
  colorOrder = DEFAULT_COLOR_ORDER,
  onSelect,
  formatLabel = (label) => label,
  labelClassName = "text-lg",
  cardSizeClassName = "h-28 w-36",
  gapClassName = "gap-3",
  labelStroke = false,
  icons,
  images,
}: {
  title: string;
  items: HighlightItem[];
  colorOrder?: number[];
  onSelect: (label: string) => void;
  formatLabel?: (label: string) => string;
  labelClassName?: string;
  cardSizeClassName?: string;
  gapClassName?: string;
  labelStroke?: boolean;
  icons?: Record<string, JSX.Element>;
  images?: Record<string, string>;
}) {
  // "Povleci za drsenje" z miško (na dotik že deluje naravno prek
  // overflow-x-auto). `moved` loči vlečenje od navadnega klika, da klik na
  // kartico po vlečenju ne sproži izbire. (Hook mora biti pred zgodnjim
  // "return null", da vrstni red klicanja hookov ostane enak.)
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  // Slika se uporabi le, če se je dejansko uspešno naložila — dokler
  // manjka (uporabnik je še ni naložil v public/images/eras/), kartica
  // ostane enaka kot brez slik (isti hook mora teči pred zgodnjim return).
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!images) return;
    let cancelled = false;
    for (const url of new Set(Object.values(images))) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setLoadedImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [images]);

  if (items.length === 0) return null;

  // Miška na namizju ima privzeto samo navpičen skrol — pretvorimo ga v
  // vodoraven drsenje čez kartice, ko je kazalec nad vrstico.
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (e.deltaY === 0) return;
    e.currentTarget.scrollLeft += e.deltaY;
    e.preventDefault();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    drag.current = { down: true, startX: e.clientX, startScroll: e.currentTarget.scrollLeft, moved: false };
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    e.currentTarget.scrollLeft = drag.current.startScroll - dx;
  }
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.down) return;
    drag.current.down = false;
    // Sami animiramo poravnavo na najbližjo kartico po spustu miške, da je
    // gladka (eased) ne glede na brskalnikovo privzeto, včasih sunkovito,
    // obravnavo CSS scroll-snap.
    if (drag.current.moved) {
      const el = e.currentTarget;
      const step = 144 + 12; // širina kartice (w-36) + razmik (gap-3)
      const maxScroll = el.scrollWidth - el.clientWidth;
      const index = Math.round(el.scrollLeft / step);
      const target = Math.min(Math.max(index * step, 0), maxScroll);
      el.scrollTo({ left: target, behavior: "smooth" });
    }
  }
  function handleCardClick(e: React.MouseEvent, label: string) {
    if (drag.current.moved) {
      e.preventDefault();
      return;
    }
    onSelect(label);
  }

  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-neutral-800 dark:text-neutral-100">
        {title}
      </h2>
      <div
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`-mx-4 -mb-[34px] flex ${gapClassName} overflow-x-auto px-4 pt-1 pb-10 [&::-webkit-scrollbar]:hidden cursor-grab select-none active:cursor-grabbing`}
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item, i) => {
          const accent = ACCENTS[colorOrder[i % colorOrder.length]];
          const icon = icons?.[item.label];
          const imageUrl = images?.[item.label];
          const image = imageUrl && loadedImages.has(imageUrl) ? imageUrl : undefined;
          return (
            <button
              key={item.label}
              type="button"
              onClick={(e) => handleCardClick(e, item.label)}
              style={{
                backgroundImage: image
                  ? undefined
                  : `radial-gradient(120% 90% at 0% 0%, ${accent}26 0%, transparent 60%)`,
                borderColor: `${accent}38`,
                boxShadow: `0 10px 24px -10px ${accent}40, 0 2px 8px -4px rgb(0 0 0 / 0.15)`,
              }}
              className={`group relative flex ${cardSizeClassName} shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition active:scale-[0.97] ${
                image
                  ? "bg-neutral-800 text-white"
                  : "bg-white text-neutral-900 dark:bg-[#111114] dark:text-white"
              }`}
            >
              {image && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 opacity-80"
                  style={{ backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }}
                />
              )}
              {image && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ backgroundImage: "linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0.15))" }}
                />
              )}
              {icon && (
                <span
                  aria-hidden="true"
                  style={{ color: accent }}
                  className="pointer-events-none absolute -right-4 -bottom-4 h-20 w-20 rotate-[-12deg] opacity-[0.22] transition-transform duration-300 group-active:rotate-[-6deg]"
                >
                  {icon}
                </span>
              )}
              <div className="relative">
                <p
                  className={`${labelClassName} leading-tight font-bold`}
                  style={labelStroke ? { WebkitTextStroke: `1px ${accent}38` } : undefined}
                >
                  {formatLabel(item.label)}
                </p>
                <div className="mt-1.5 h-px w-8 rounded-full" style={{ backgroundColor: accent }} />
              </div>
              <p
                className={`relative text-xs font-medium ${
                  image ? "text-white/85" : "text-neutral-500 dark:text-white/50"
                }`}
              >
                {skladbeLabel(item.count)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HomeHighlights({
  eras,
  genres,
  onSelectEra,
  onSelectGenre,
}: {
  eras: HighlightItem[];
  genres: HighlightItem[];
  onSelectEra: (era: string) => void;
  onSelectGenre: (genre: string) => void;
}) {
  if (eras.length === 0 && genres.length === 0) return null;

  return (
    <div className="space-y-0">
      <HighlightRow
        title="Obdobja"
        items={eras}
        colorOrder={ERA_COLOR_ORDER}
        onSelect={onSelectEra}
        formatLabel={formatEraLabel}
        labelClassName="text-4xl lg:text-5xl"
        cardSizeClassName="h-28 w-36 lg:h-36 lg:w-48"
        gapClassName="gap-3 lg:gap-4"
        labelStroke
        images={ERA_IMAGES}
      />
      <HighlightRow
        title="Žanri"
        items={genres}
        colorOrder={GENRE_COLOR_ORDER}
        onSelect={onSelectGenre}
        labelClassName="text-lg lg:text-2xl"
        cardSizeClassName="h-28 w-36 lg:h-32 lg:w-40"
        icons={GENRE_ICONS}
      />
    </div>
  );
}
