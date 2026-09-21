"use client";

import { useCopyFeedback } from "@/lib/useCopyFeedback";
import type { FeaturedGroup } from "@/lib/dailyRandom";
import type { Song } from "@/types/song";

// Dva odtenka iz iste "dark neon" palete kot HomeHighlights, da je slog
// domače strani enoten.
const ACCENTS = ["#10b981", "#60a5fa"];

function SongRow({ song, onCopy }: { song: Song; onCopy: (song: Song) => void }) {
  const [copied, triggerCopy] = useCopyFeedback();

  return (
    <button
      type="button"
      onClick={() => triggerCopy(song.title).then((ok) => ok && onCopy(song))}
      title="Klikni za kopiranje naslova"
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-700 transition hover:bg-black/5 dark:text-white/85 dark:hover:bg-white/10"
    >
      <span className="truncate">{song.title}</span>
      {copied && (
        <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          kopirano :)
        </span>
      )}
    </button>
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
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-neutral-800 dark:text-neutral-100">
        Predstavljeno
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((group, i) => {
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <div
              key={group.author}
              style={{
                backgroundImage: `radial-gradient(120% 90% at 0% 0%, ${accent}3d 0%, transparent 60%)`,
                borderColor: `${accent}4d`,
                boxShadow: `0 10px 24px -10px ${accent}73, 0 2px 8px -4px rgb(0 0 0 / 0.15)`,
              }}
              className="rounded-2xl border bg-white p-3.5 dark:bg-[#111114]"
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
                {group.songs.map((song) => (
                  <SongRow key={song.id} song={song} onCopy={onCopy} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
