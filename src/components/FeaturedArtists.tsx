"use client";

import { useState } from "react";
import ChordsButtons from "@/components/ChordsButtons";
import { authorAccentHex } from "@/lib/authorColor";
import type { FeaturedGroup } from "@/lib/dailyRandom";
import type { Song } from "@/types/song";

function SongRow({
  song,
  index,
  accent,
  onChordsClick,
}: {
  song: Song;
  index: number;
  accent: string;
  onChordsClick?: (song: Song) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-700 dark:text-white/85">
      <span
        style={{ backgroundColor: `${accent}26`, color: accent }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-base lg:text-sm">{song.title}</span>
      </div>
      <ChordsButtons song={song} onChordsClick={onChordsClick} stacked merged />
    </div>
  );
}

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
      style={{
        backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${accent}26 0%, transparent 60%)`,
        borderColor: `${accent}38`,
        boxShadow: `0 10px 24px -10px ${accent}40, 0 2px 8px -4px rgb(0 0 0 / 0.15)`,
      }}
      className={`rounded-2xl border bg-white p-3.5 dark:bg-[#111114] ${className}`}
    >
      <button
        type="button"
        onClick={() => onFilterAuthor(group.author)}
        style={{ color: accent }}
        className="mb-2 block text-left text-lg leading-tight font-bold hover:underline lg:text-xl"
      >
        {group.author}
      </button>
      <div className="space-y-0.5">
        {group.songs.map((song, songIndex) => (
          <SongRow key={song.id} song={song} index={songIndex + 1} accent={accent} onChordsClick={onChordsClick} />
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

  if (items.length === 0) return null;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const fraction = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    setActiveDot(Math.round(fraction * (items.length - 1)));
  }

  return (
    <div className="pb-1.5">
      <h2 className="mb-2 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
        Predstavljeno
      </h2>

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
              className="w-full shrink-0 snap-start pb-1"
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
          <div className="mt-2 flex justify-center gap-1.5">
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
  );
}
