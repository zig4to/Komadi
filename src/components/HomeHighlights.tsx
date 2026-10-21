"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import HomeSectionHeading, { homeSectionBodyClass, useHomeSectionOpen } from "@/components/HomeSectionHeading";
import { ERA_IMAGES, PORTRAIT_FOCUS_Y } from "@/lib/constants";

// Črtni motiv na žanr (kartice Žanri, varianta "stat"): v spodnjem desnem kotu,
// v barvi žanra, ponazarja zvok/značaj žanra namesto ikone. viewBox 160×120,
// risano v desni spodnji del. Ključi se morajo ujemati z GENRES v
// src/lib/constants.ts; žanr brez motiva dobi preprost val.
const MW = 160;

// Krivulja y = base + f(x) od x0 do MW, vzorčena na 2 px.
function curve(f: (x: number) => number, base: number, x0 = 40) {
  let d = "";
  for (let x = x0; x <= MW + 2; x += 2) d += `${d ? "L" : "M"}${x} ${(base + f(x)).toFixed(1)}`;
  return d;
}
const sine = (amp: number, period: number, phase = 0) => (x: number) => amp * Math.sin(((x + phase) / period) * Math.PI * 2);
// Deterministično "naključje" (enak motiv ob vsakem izrisu).
const rand = (i: number) => {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function paths(...d: string[]) {
  return d.map((p, i) => <path key={i} d={p} />);
}

const GENRE_MOTIFS: Record<string, JSX.Element> = {
  // Rock: "nasičen" val (zaobljen pravokotnik) — distorzija ojačevalca.
  Rock: <>{paths(curve((x) => 14 * Math.tanh(3 * Math.sin((x / 34) * Math.PI * 2)), 84), curve((x) => 9 * Math.tanh(3 * Math.sin(((x + 9) / 34) * Math.PI * 2)), 104))}</>,
  // Hard rock: žagast val, večja amplituda.
  "Hard rock": (
    <>
      {paths(
        curve((x) => 18 * (((x / 26) % 1) * 2 - 1), 82),
        curve((x) => 10 * ((((x + 13) / 26) % 1) * 2 - 1), 106),
      )}
    </>
  ),
  // Yugo rock: reflektor — loki iz kota (oder).
  "Yugo rock": (
    <>
      {[22, 40, 58, 76, 94].map((r) => (
        <path key={r} d={`M${MW - r} 120 A${r} ${r} 0 0 1 ${MW} ${120 - r}`} />
      ))}
    </>
  ),
  // Punk: raztrgan cikcak.
  Punk: (
    <>
      {paths(
        Array.from({ length: 16 }, (_, i) => `${i ? "L" : "M"}${44 + i * 8} ${(62 + rand(i) * 46).toFixed(1)}`).join(""),
      )}
    </>
  ),
  // Metal: ostre konice.
  Metal: (
    <>
      {paths(
        Array.from({ length: 10 }, (_, i) => `${i ? "L" : "M"}${46 + i * 12} ${i % 2 ? 118 : 118 - 22 - rand(i + 3) * 36}`).join("") + `L${MW} 118`,
      )}
    </>
  ),
  // Pop: mehurčki.
  Pop: (
    <>
      {[
        [128, 88, 22],
        [94, 102, 12],
        [148, 50, 9],
        [104, 68, 6],
        [70, 110, 5],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </>
  ),
  // Pop rock: mehurčki na valu.
  "Pop rock": (
    <>
      {paths(curve(sine(8, 44), 100))}
      {[
        [126, 70, 14],
        [92, 76, 7],
        [150, 44, 6],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </>
  ),
  // Indie: ohlapna spirala (kot narisana z roko).
  Indie: (
    <>
      {paths(
        Array.from({ length: 90 }, (_, i) => {
          const t = i / 10;
          const r = 4 + t * 5.2;
          return `${i ? "L" : "M"}${(122 + r * Math.cos(t)).toFixed(1)} ${(84 + r * Math.sin(t) * 0.9).toFixed(1)}`;
        }).join(""),
      )}
    </>
  ),
  // Blues: počasni valovi, trije drug pod drugim.
  Blues: <>{paths(curve(sine(7, 70), 74), curve(sine(7, 70, 12), 92), curve(sine(7, 70, 24), 110))}</>,
  // Country: valoviti griči.
  Country: (
    <>
      {paths(
        `M40 112 Q70 86 100 108 T160 100`,
        `M60 120 Q96 92 128 112 T172 108`,
        `M86 96 Q112 70 140 90 T176 84`,
      )}
    </>
  ),
  // Reggae: poudarki na "off-beat" — visoki taktni drogovi na vsakem drugem.
  Reggae: (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const x = 54 + i * 9;
        const h = i % 2 ? 38 + rand(i) * 18 : 10;
        return <path key={i} d={`M${x} 116 V${116 - h}`} />;
      })}
    </>
  ),
  // Rap: ekvalizator (stolpci različnih višin, zaobljeni).
  Rap: (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const x = 62 + i * 11;
        const h = 14 + rand(i + 7) * 58;
        return <rect key={i} x={x} y={116 - h} width={6} height={h} rx={3} />;
      })}
    </>
  ),
  // Balada / akustika: resonančna odprtina kitare in strune.
  "Balada / akustika": (
    <>
      <circle cx={124} cy={88} r={26} />
      <circle cx={124} cy={88} r={32} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M40 ${73 + i * 6} H${MW}`} />
      ))}
    </>
  ),
  // Dalmatinske: morski valovi (luske v vrstah).
  Dalmatinske: (
    <>
      {[0, 1, 2].map((row) => (
        <path
          key={row}
          d={Array.from({ length: 9 }, (_, i) => {
            const x = 46 + i * 14 + (row % 2) * 7;
            const y = 84 + row * 14;
            return `M${x} ${y} a7 7 0 0 1 14 0`;
          }).join("")}
        />
      ))}
    </>
  ),
};
const DEFAULT_MOTIF = <>{paths(curve(sine(10, 50), 92))}</>;

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
  accentForLabel,
  shadowAlpha = "40",
  glowAlpha = "26",
  imageOpacityClassName = "opacity-80",
  variant = "classic",
  motifs,
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
  // Barva po identiteti nalepke (npr. avtorju) namesto po njenem položaju v
  // vrstici — tako ima ista nalepka vedno isto barvo, ujemajoč se z barvo
  // uporabljeno drugod v aplikaciji (glej src/lib/authorColor.ts).
  accentForLabel?: (label: string) => string;
  // Prosojnost (dvomestna hex vrednost, "00"-"ff") barvnega sija okoli
  // kartice (senca) in znotraj nje (gradient) — nižje = manj opazen sij.
  shadowAlpha?: string;
  glowAlpha?: string;
  // Prosojnost slike v ozadju kartice (ko je `images` nastavljen) — ločeno
  // od `shadowAlpha`/`glowAlpha`, ki krmilita sij okoli/pod kartico.
  imageOpacityClassName?: string;
  // "stat": v slogu statističnih kartic domače strani (HomeDashboard StatCard) —
  // pikica v barvi + "N skladb" zgoraj, ↗, spodaj velika tanka oznaka; slika le
  // kot barven, prosojen sloj, ki se proti levi zlije s kartico.
  variant?: "classic" | "stat";
  // Varianta "stat": črtni motiv v kotu po nalepki (žanri), v barvi kartice.
  motifs?: Record<string, JSX.Element>;
}) {
  // "Povleci za drsenje" z miško (na dotik že deluje naravno prek
  // overflow-x-auto). `moved` loči vlečenje od navadnega klika, da klik na
  // kartico po vlečenju ne sproži izbire. (Hook mora biti pred zgodnjim
  // "return null", da vrstni red klicanja hookov ostane enak.)
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });
  // Na telefonu zložljivo (ključ = naslov: Obdobja/Žanri/Avtorji).
  const [open, setOpen] = useHomeSectionOpen(title);

  // Slika se uporabi le, če se je dejansko uspešno naložila — dokler
  // manjka (uporabnik je še ni naložil v public/images/eras/), kartica
  // ostane enaka kot brez slik (isti hook mora teči pred zgodnjim return).
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  // Pokončne slike (npr. portret avtorja): izrez od zgornjega dela, ne od
  // sredine, da glava ostane vidna (PORTRAIT_FOCUS_Y v constants.ts).
  const [portraitImages, setPortraitImages] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!images) return;
    let cancelled = false;
    for (const url of new Set(Object.values(images))) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setLoadedImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
        if (img.naturalHeight > img.naturalWidth)
          setPortraitImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      };
      img.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [images]);

  if (items.length === 0) return null;

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
    // data-home-section: cilj gumba "Vrni se na vrh" pod seznamom (Obdobja).
    <div data-home-section={title} className="scroll-mt-4">
      <HomeSectionHeading title={title} open={open} onToggle={() => setOpen((v) => !v)} />
      <div className={homeSectionBodyClass(open)}>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`-mx-4 -mb-[34px] flex ${gapClassName} overflow-x-auto px-4 pt-1 pb-10 [&::-webkit-scrollbar]:hidden cursor-grab select-none active:cursor-grabbing`}
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item, i) => {
          const accent = accentForLabel ? accentForLabel(item.label) : ACCENTS[colorOrder[i % colorOrder.length]];
          const icon = icons?.[item.label];
          const imageUrl = images?.[item.label];
          const image = imageUrl && loadedImages.has(imageUrl) ? imageUrl : undefined;
          if (variant === "stat") {
            return (
              <button
                key={item.label}
                type="button"
                onClick={(e) => handleCardClick(e, item.label)}
                className={`group relative isolate flex ${cardSizeClassName} shrink-0 flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3.5 text-left transition hover:bg-neutral-50 active:scale-[0.97] lg:p-4 dark:rounded-[26px] dark:border-white/[0.08] dark:bg-white/[0.035] dark:hover:bg-white/[0.06]`}
              >
                {image && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 opacity-[0.35] transition duration-300 group-hover:opacity-50 dark:opacity-[0.3] dark:group-hover:opacity-[0.45]"
                    style={{
                      backgroundImage: `url(${image})`,
                      backgroundSize: "cover",
                      backgroundPosition: portraitImages.has(image) ? `center ${PORTRAIT_FOCUS_Y}` : "center",
                      maskImage: "linear-gradient(to left, #000 25%, transparent 95%)",
                      WebkitMaskImage: "linear-gradient(to left, #000 25%, transparent 95%)",
                    }}
                  />
                )}
                {motifs && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 160 120"
                    preserveAspectRatio="xMaxYMax meet"
                    style={{ color: accent }}
                    className="pointer-events-none absolute -right-[18%] bottom-0 -z-10 h-full w-[85%] opacity-0 transition-opacity duration-300 group-hover:opacity-80 dark:group-hover:opacity-70 [@media(hover:none)]:opacity-20 dark:[@media(hover:none)]:opacity-[0.15]"
                  >
                    <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                      {motifs[item.label] ?? DEFAULT_MOTIF}
                    </g>
                  </svg>
                )}
                <span className="flex min-w-0 items-center gap-2 pr-5 text-xs text-neutral-500 lg:text-sm dark:text-neutral-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="truncate">{skladbeLabel(item.count)}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="absolute right-3.5 top-3.5 h-4 w-4 text-neutral-400 lg:right-4 lg:top-4 dark:text-neutral-600">
                  <path d="M7 17 17 7M7 7h10v10" />
                </svg>
                <span className={`${labelClassName} block leading-none font-light tabular-nums text-neutral-900 dark:font-extralight dark:text-white`}>
                  {formatLabel(item.label)}
                </span>
              </button>
            );
          }
          return (
            <button
              key={item.label}
              type="button"
              onClick={(e) => handleCardClick(e, item.label)}
              style={{
                backgroundImage: image
                  ? undefined
                  : `radial-gradient(120% 90% at 0% 0%, ${accent}${glowAlpha} 0%, transparent 60%)`,
                borderColor: `${accent}38`,
                boxShadow: `0 10px 24px -10px ${accent}${shadowAlpha}, 0 2px 8px -4px rgb(0 0 0 / 0.15)`,
              }}
              className={`group relative flex ${cardSizeClassName} shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition active:scale-[0.97] dark:rounded-[26px] dark:border-white/[0.08]! dark:shadow-none! ${
                image
                  ? "bg-neutral-800 text-white"
                  : "bg-white text-neutral-900 dark:bg-white/[0.035] dark:bg-none! dark:text-white dark:hover:bg-white/[0.06]"
              }`}
            >
              {image && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 dark:grayscale-[30%] ${imageOpacityClassName}`}
                  style={{
                    backgroundImage: `url(${image})`,
                    backgroundSize: "cover",
                    backgroundPosition: portraitImages.has(image) ? `center ${PORTRAIT_FOCUS_Y}` : "center",
                  }}
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
                  className="pointer-events-none absolute -right-4 -bottom-4 h-20 w-20 rotate-[-12deg] opacity-[0.22] transition-transform duration-300 group-active:rotate-[-6deg] dark:opacity-[0.12]"
                >
                  {icon}
                </span>
              )}
              <div className="relative">
                <p
                  className={`${labelClassName} leading-tight font-bold dark:font-light`}
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
    </div>
  );
}

export default function HomeHighlights({
  eras,
  genres,
  onSelectEra,
  onSelectGenre,
  only,
}: {
  eras: HighlightItem[];
  genres: HighlightItem[];
  onSelectEra: (era: string) => void;
  onSelectGenre: (genre: string) => void;
  // Samo ena vrsta (domača stran: Žanri so pod Avtorji); brez = obe.
  only?: "eras" | "genres";
}) {
  const showEras = only !== "genres" && eras.length > 0;
  const showGenres = only !== "eras" && genres.length > 0;
  if (!showEras && !showGenres) return null;

  return (
    <div className="space-y-0">
      {showEras && (
      <HighlightRow
        title="Obdobja"
        items={eras}
        colorOrder={ERA_COLOR_ORDER}
        onSelect={onSelectEra}
        formatLabel={formatEraLabel}
        labelClassName="text-4xl lg:text-5xl"
        cardSizeClassName="h-28 w-36 lg:h-36 lg:w-48"
        gapClassName="gap-3 lg:gap-4"
        images={ERA_IMAGES}
        variant="stat"
      />
      )}
      {showGenres && (
      <div className={showEras ? "mt-3" : ""}>
        <HighlightRow
          title="Žanri"
          items={genres}
          colorOrder={GENRE_COLOR_ORDER}
          onSelect={onSelectGenre}
          labelClassName="text-xl leading-tight! lg:text-3xl"
          cardSizeClassName="h-28 w-36 lg:h-36 lg:w-48"
          gapClassName="gap-3 lg:gap-4"
          variant="stat"
          motifs={GENRE_MOTIFS}
        />
      </div>
      )}
    </div>
  );
}
