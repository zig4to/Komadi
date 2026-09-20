"use client";

import { useState } from "react";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { supabase } from "@/lib/supabaseClient";
import type { SimilarSong, Song } from "@/types/song";

// Stabilen odtenek barve iz ID-ja skladbe (enak ob vsakem izrisu).
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function SongCard({
  song,
  onEdit,
  onDelete,
  onToggleFavorite,
  onCopy,
  onAddSimilar,
  highlighted = false,
}: {
  song: Song;
  onEdit: (song: Song) => void;
  onDelete?: (id: string) => void;
  onToggleFavorite: (song: Song) => void;
  onCopy?: (song: Song) => void;
  onAddSimilar?: (song: SimilarSong) => void;
  highlighted?: boolean;
}) {
  const [copied, triggerCopy] = useCopyFeedback();
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarSongs, setSimilarSongs] = useState<SimilarSong[]>([]);

  async function fetchSimilar(exclude: SimilarSong[]) {
    setSimilarLoading(true);
    setSimilarError(null);

    const { data, error } = await supabase.functions.invoke("similar-songs", {
      body: { title: song.title, author: song.author, exclude },
    });

    setSimilarLoading(false);

    const songs = (data as { songs?: SimilarSong[] } | null)?.songs;
    if (error || !songs) {
      setSimilarError(
        (data as { error?: string } | null)?.error ??
          error?.message ??
          "Predlogov ni bilo mogoče pridobiti.",
      );
      return;
    }
    setSimilarSongs(songs);
  }

  function handleToggleSimilar() {
    if (similarOpen) {
      setSimilarOpen(false);
      return;
    }
    setSimilarOpen(true);
    if (similarSongs.length === 0) fetchSimilar([]);
  }

  const hue = hueFromId(song.id);
  const cardStyle: React.CSSProperties = highlighted
    ? {
        boxShadow:
          "0 12px 36px -18px rgb(16 185 129 / 0.28), 0 2px 8px -6px rgb(0 0 0 / 0.32)",
      }
    : {
        boxShadow: `0 12px 36px -20px hsl(${hue} 85% 55% / 0.24), 0 2px 8px -7px rgb(0 0 0 / 0.32)`,
        borderColor: `hsl(${hue} 50% 42% / 0.55)`,
      };

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    // Klik na gumb (priljubljene / uredi / izbriši) ne kopira.
    if ((e.target as HTMLElement).closest("button, a")) return;
    triggerCopy(song.title).then((ok) => {
      if (ok) onCopy?.(song);
    });
  }

  return (
    <div
      onClick={handleCardClick}
      title="Klikni za kopiranje naslova"
      style={cardStyle}
      className={`relative cursor-pointer rounded-xl border bg-transparent p-4 transition duration-200 hover:-translate-y-0.5 ${
        highlighted
          ? "border-emerald-500"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
          <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{song.author}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(song)}
            aria-label={song.favorite ? "Odstrani iz priljubljenih" : "Dodaj med priljubljene"}
            title={song.favorite ? "Odstrani iz priljubljenih" : "Dodaj med priljubljene"}
            className={
              song.favorite
                ? "text-amber-500 dark:text-amber-400"
                : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill={song.favorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => onEdit(song)}
            aria-label="Uredi skladbo"
            title="Uredi skladbo"
            className="text-neutral-400 hover:text-emerald-600 dark:text-neutral-600 dark:hover:text-emerald-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
            </svg>
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(song.id)}
              aria-label="Izbriši skladbo"
              title="Izbriši skladbo"
              className="text-neutral-400 hover:text-red-600 dark:text-neutral-600 dark:hover:text-red-400"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{song.genre}</Badge>
          <Badge>{song.era}</Badge>
          {song.mood && <Badge>{song.mood}</Badge>}
        </div>

        <button
          type="button"
          onClick={handleToggleSimilar}
          aria-label={similarOpen ? "Skrij podobne skladbe" : "Najdi podobne skladbe"}
          title="Najdi podobne skladbe"
          aria-expanded={similarOpen}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 font-medium transition ${
            similarOpen
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-neutral-300 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-emerald-400"
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
            className="h-[13px] w-[13px] shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Podobno
        </button>
      </div>

      {similarOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        >
          {similarLoading && (
            <p className="text-sm text-neutral-500">Iščem podobne skladbe…</p>
          )}
          {similarError && (
            <p className="text-sm text-red-600 dark:text-red-400">{similarError}</p>
          )}
          {!similarLoading &&
            !similarError &&
            similarSongs.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                    {s.title}
                  </p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {s.author}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAddSimilar?.(s)}
                  aria-label={`Dodaj ${s.title} v knjižnico`}
                  title="Dodaj v knjižnico"
                  className="shrink-0 rounded-lg border border-neutral-300 p-1.5 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-emerald-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-[14px] w-[14px]"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            ))}
          {!similarLoading && !similarError && similarSongs.length > 0 && (
            <button
              type="button"
              onClick={() => fetchSimilar(similarSongs)}
              className="w-full text-center text-sm text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Še več
            </button>
          )}
        </div>
      )}

      {copied && (
        <span className="pointer-events-none absolute bottom-2 left-3 rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-neutral-200 dark:bg-neutral-950/80 dark:text-emerald-400 dark:ring-0">
          kopirano :)
        </span>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </span>
  );
}
