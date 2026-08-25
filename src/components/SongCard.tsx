"use client";

import type { Song } from "@/types/song";

export default function SongCard({
  song,
  onDelete,
  onToggleFavorite,
  highlighted = false,
}: {
  song: Song;
  onDelete: (id: string) => void;
  onToggleFavorite: (song: Song) => void;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        highlighted
          ? "border-emerald-500 bg-emerald-500/5"
          : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-100">{song.title}</p>
          <p className="truncate text-sm text-neutral-400">{song.author}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onToggleFavorite(song)}
            aria-label="Priljubljena"
            className={`text-lg ${song.favorite ? "text-amber-400" : "text-neutral-600 hover:text-neutral-400"}`}
          >
            {song.favorite ? "★" : "☆"}
          </button>
          <button
            onClick={() => onDelete(song.id)}
            aria-label="Izbriši"
            className="text-neutral-600 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge>{song.genre}</Badge>
        <Badge>{song.era}</Badge>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-400">
      {children}
    </span>
  );
}
