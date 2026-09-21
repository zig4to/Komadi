"use client";

import { useState } from "react";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import type { FeaturedGroup } from "@/lib/dailyRandom";
import type { Song } from "@/types/song";

// Štiri barve iz iste "dark neon" palete kot HomeHighlights, da je slog
// domače strani enoten — ena na predstavljenega avtorja.
const ACCENTS = ["#10b981", "#60a5fa", "#fb7185", "#8b5cf6"];

function SongRow({
  song,
  index,
  accent,
  onCopy,
}: {
  song: Song;
  index: number;
  accent: string;
  onCopy: (song: Song) => void;
}) {
  const [copied, triggerCopy] = useCopyFeedback();

  return (
    <button
      type="button"
      onClick={() => triggerCopy(song.title).then((ok) => ok && onCopy(song))}
      title="Klikni za kopiranje naslova"
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 transition hover:bg-black/5 dark:text-white/85 dark:hover:bg-white/10"
    >
      <span
        style={{ backgroundColor: `${accent}26`, color: accent }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      >
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate">{song.title}</span>
      {copied && (
        <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          kopirano :)
        </span>
      )}
    </button>
  );
}

function AuthorCard({
  group,
  accent,
  onCopy,
  onFilterAuthor,
  className = "",
}: {
  group: FeaturedGroup;
  accent: string;
  onCopy: (song: Song) => void;
  onFilterAuthor: (author: string) => void;
  className?: string;
}) {
  return (
    <div
      style={{
        backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${accent}3d 0%, transparent 60%)`,
        borderColor: `${accent}4d`,
        boxShadow: `0 10px 24px -10px ${accent}73, 0 2px 8px -4px rgb(0 0 0 / 0.15)`,
      }}
      className={`rounded-2xl border bg-white p-3.5 dark:bg-[#111114] ${className}`}
    >
      <button
        type="button"
        onClick={() => onFilterAuthor(group.author)}
        style={{ color: accent }}
        className="mb-2 block text-left text-lg leading-tight font-bold hover:underline"
      >
        {group.author}
      </button>
      <div className="space-y-0.5">
        {group.songs.map((song, songIndex) => (
          <SongRow key={song.id} song={song} index={songIndex + 1} accent={accent} onCopy={onCopy} />
        ))}
      </div>
    </div>
  );
}

export default function FeaturedArtists({
  items,
  onCopy,
  onFilterAuthor,
}: {
  items: FeaturedGroup[];
  onCopy: (song: Song) => void;
  onFilterAuthor: (author: string) => void;
}) {
  const [activeDot, setActiveDot] = useState(0);

  if (items.length === 0) return null;

  // Telefon: po dva avtorja na "stran" (druga kartica eno vrstico nižje),
  // vsaka kartica čez celo širino — swipe levo pokaže naslednji par.
  const pages: { group: FeaturedGroup; accentIndex: number }[][] = [];
  items.forEach((group, i) => {
    const pageIndex = Math.floor(i / 2);
    (pages[pageIndex] ??= []).push({ group, accentIndex: i });
  });

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const fraction = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    setActiveDot(Math.round(fraction * (pages.length - 1)));
  }

  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-neutral-800 dark:text-neutral-100">
        Predstavljeno
      </h2>

      {/* Namizje: vsi avtorji v eni vrstici. */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        {items.map((group, i) => (
          <AuthorCard
            key={group.author}
            group={group}
            accent={ACCENTS[i % ACCENTS.length]}
            onCopy={onCopy}
            onFilterAuthor={onFilterAuthor}
          />
        ))}
      </div>

      {/* Telefon/tablica: po dva avtorja (druga vrstica) na drsno "stran",
          vsaka kartica čez celo širino. */}
      <div className="lg:hidden">
        <div
          onScroll={handleScroll}
          className="-mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 scroll-pl-4 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              className="flex w-full shrink-0 snap-start flex-col gap-3 pb-1"
              style={{ paddingRight: pageIndex < pages.length - 1 ? "0.75rem" : 0 }}
            >
              {page.map(({ group, accentIndex }) => (
                <AuthorCard
                  key={group.author}
                  group={group}
                  accent={ACCENTS[accentIndex % ACCENTS.length]}
                  onCopy={onCopy}
                  onFilterAuthor={onFilterAuthor}
                />
              ))}
            </div>
          ))}
        </div>

        {pages.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5">
            {pages.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === activeDot
                    ? "w-4 bg-neutral-700 dark:bg-neutral-200"
                    : "w-1.5 bg-neutral-300 dark:bg-neutral-700"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
