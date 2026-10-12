"use client";

import { useState } from "react";
import ChordsButtons from "@/components/ChordsButtons";
import HomeSectionHeading, { homeSectionBodyClass, useHomeSectionOpen } from "@/components/HomeSectionHeading";
import { authorAccentHex } from "@/lib/authorColor";
import type { FeaturedGroup } from "@/lib/dailyRandom";
import type { Song } from "@/types/song";

// Slovensko sklanjanje: 1 skladba, 2 skladbi, 3-4 skladbe, 5+ skladb.
function skladbe(n: number) {
  const m = n % 100;
  if (m === 1) return `${n} skladba`;
  if (m === 2) return `${n} skladbi`;
  if (m === 3 || m === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

function SongRow({
  song,
  index,
  onChordsClick,
}: {
  song: Song;
  index: number;
  onChordsClick?: (song: Song) => void;
}) {
  return (
    <div data-chords-card className="flex w-full items-center gap-3 py-2 text-sm">
      <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-neutral-400 dark:text-neutral-500">
        {String(index).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1 truncate text-base text-neutral-800 lg:text-sm dark:text-white/85">{song.title}</span>
      <ChordsButtons song={song} onChordsClick={onChordsClick} stacked merged menuAlign="right" />
    </div>
  );
}

// Kartica avtorja v slogu domače strani (kot StatCard v HomeDashboard): pikica v
// barvi avtorja + število skladb, ↗, ime s tanko pisavo, skladbe ločene s tankimi črtami.
function AuthorCard({
  group,
  accent,
  onFilterAuthor,
  onChordsClick,
  className = "",
}: {
  group: FeaturedGroup;
  accent: string;
  onFilterAuthor: (author: string) => void;
  onChordsClick?: (song: Song) => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-4 dark:rounded-[26px] dark:border-white/[0.08] dark:bg-white/[0.035] ${className}`}
    >
      <button
        type="button"
        onClick={() => onFilterAuthor(group.author)}
        title={`Prikaži vse skladbe izvajalca ${group.author}`}
        className="group relative mb-2 block w-full text-left"
      >
        <span className="flex items-center gap-2 pr-6 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
          <span className="truncate">{skladbe(group.songs.length)}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="absolute right-0 top-0 h-4 w-4 text-neutral-400 transition group-hover:text-neutral-700 dark:text-neutral-600 dark:group-hover:text-neutral-300">
          <path d="M7 17 17 7M7 7h10v10" />
        </svg>
        <span className="mt-1.5 line-clamp-2 block text-xl leading-tight font-light break-words text-neutral-900 lg:text-lg dark:font-extralight dark:text-white">
          {group.author}
        </span>
      </button>
      <div className="divide-y divide-neutral-200 dark:divide-white/[0.06]">
        {group.songs.map((song, songIndex) => (
          <SongRow key={song.id} song={song} index={songIndex + 1} onChordsClick={onChordsClick} />
        ))}
      </div>
    </div>
  );
}

export default function FeaturedArtists({
  items,
  onFilterAuthor,
  onChordsClick,
}: {
  items: FeaturedGroup[];
  onFilterAuthor: (author: string) => void;
  onChordsClick?: (song: Song) => void;
}) {
  const [activeDot, setActiveDot] = useState(0);
  // Na telefonu zložljivo (HomeSectionHeading).
  const [open, setOpen] = useHomeSectionOpen("predstavljeno");

  if (items.length === 0) return null;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const fraction = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    setActiveDot(Math.round(fraction * (items.length - 1)));
  }

  return (
    <div className="relative z-10 pb-1.5">
      <HomeSectionHeading title="Predstavljeno" open={open} onToggle={() => setOpen((v) => !v)} />
      <div className={homeSectionBodyClass(open)}>

      {/* Namizje: vsi avtorji v eni vrstici. */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        {items.map((group) => (
          <AuthorCard
            key={group.author}
            group={group}
            accent={authorAccentHex(group.author)}
            onFilterAuthor={onFilterAuthor}
            onChordsClick={onChordsClick}
          />
        ))}
      </div>

      {/* Telefon/tablica: en avtor na "stran", vsaka kartica čez celo
          širino — swipe levo pokaže naslednjega avtorja, eno kartico naenkrat. */}
      <div className="lg:hidden">
        <div
          onScroll={handleScroll}
          className="-mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 scroll-pl-4 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((group, i) => (
            <div
              key={group.author}
              className="w-full shrink-0 snap-start pb-6"
              style={{ paddingRight: i < items.length - 1 ? "0.75rem" : 0 }}
            >
              <AuthorCard
                group={group}
                accent={authorAccentHex(group.author)}
                onFilterAuthor={onFilterAuthor}
                onChordsClick={onChordsClick}
              />
            </div>
          ))}
        </div>

        {items.length > 1 && (
          <div className="-mt-4 flex justify-center gap-1.5">
            {items.map((_, i) => (
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
    </div>
  );
}
