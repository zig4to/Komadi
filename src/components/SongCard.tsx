"use client";

import { useState } from "react";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { supabase } from "@/lib/supabaseClient";
import type { SimilarSong, Song } from "@/types/song";

// Diagonalna "zagozda" s sliko na desni strani kartice — enak pristop kot
// eventCard/eventCardImage v projektu masCajt (styles.js): clip-path izreže
// nagnjen štirikotnik (širši zgoraj, ožji spodaj), mask-image nato zmehča
// rezan rob v gradient namesto ostre črte, opacity pa sliko "potopi" v barvo
// kartice namesto da bi bila prilepljena na vrhu.
const IMAGE_CLIP_PATH = "polygon(30% 0, 100% 0, 100% 100%, 10% 100%)";
const IMAGE_EDGE_MASK = "linear-gradient(106deg, transparent 20%, #000 34%)";

// Stabilen odtenek barve iz ID-ja skladbe (enak ob vsakem izrisu).
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export default function SongCard({
  song,
  authorImage = null,
  onEdit,
  onDelete,
  onToggleFavorite,
  onCopy,
  onAddSimilar,
  onFilterAuthor,
  highlighted = false,
}: {
  song: Song;
  authorImage?: string | null;
  onEdit: (song: Song) => void;
  onDelete?: (id: string) => void;
  onToggleFavorite: (song: Song) => void;
  onCopy?: (song: Song) => void;
  onAddSimilar?: (song: SimilarSong) => void;
  onFilterAuthor?: (author: string) => void;
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

  // Emerald ~152° za izpostavljeno (naključno izbrano) kartico, sicer
  // stabilen odtenek iz ID-ja skladbe — isti odtenek uporabimo tudi za
  // obrobo/senco (spodaj) in za delni gradient ozadja (glej className).
  const hue = highlighted ? 152 : hueFromId(song.id);
  const cardStyle = {
    boxShadow: highlighted
      ? "0 12px 36px -18px rgb(16 185 129 / 0.28), 0 2px 8px -6px rgb(0 0 0 / 0.32)"
      : `0 12px 36px -20px hsl(${hue} 85% 55% / 0.24), 0 2px 8px -7px rgb(0 0 0 / 0.32)`,
    borderColor: highlighted ? undefined : `hsl(${hue} 50% 42% / 0.55)`,
    "--hue": hue,
  } as React.CSSProperties;

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
      className={`relative isolate cursor-pointer overflow-hidden rounded-xl border bg-[linear-gradient(135deg,hsl(var(--hue)_85%_55%/0.10),transparent_60%)] p-4 transition duration-200 hover:-translate-y-0.5 dark:bg-[linear-gradient(135deg,hsl(var(--hue)_85%_55%/0.20),transparent_60%)] ${
        highlighted
          ? "border-emerald-500"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      {authorImage && (
        <img
          src={authorImage}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-y-0 -right-8 h-full w-[63%] object-cover object-right"
          style={{
            clipPath: IMAGE_CLIP_PATH,
            opacity: 0.8,
            WebkitMaskImage: IMAGE_EDGE_MASK,
            maskImage: IMAGE_EDGE_MASK,
            zIndex: -1,
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{song.title}</p>
          <button
            type="button"
            onClick={() => onFilterAuthor?.(song.author)}
            title={`Prikaži vse skladbe izvajalca ${song.author}`}
            className="block max-w-full truncate text-left text-sm text-neutral-500 hover:text-emerald-600 hover:underline dark:text-neutral-400 dark:hover:text-emerald-400"
          >
            {song.author}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(song)}
            aria-label={song.favorite ? "Odstrani iz priljubljenih" : "Dodaj med priljubljene"}
            title={song.favorite ? "Odstrani iz priljubljenih" : "Dodaj med priljubljene"}
            className={`rounded-full bg-white/70 p-1.5 backdrop-blur-sm dark:bg-neutral-900/70 ${
              song.favorite
                ? "text-amber-500 dark:text-amber-400"
                : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
            }`}
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
            className="rounded-full bg-white/70 p-1.5 text-neutral-400 backdrop-blur-sm hover:text-emerald-600 dark:bg-neutral-900/70 dark:text-neutral-600 dark:hover:text-emerald-400"
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
              className="rounded-full bg-white/70 p-1.5 text-neutral-400 backdrop-blur-sm hover:text-red-600 dark:bg-neutral-900/70 dark:text-neutral-600 dark:hover:text-red-400"
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
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto">
          <Badge>{song.genre}</Badge>
          <Badge>{song.era}</Badge>
          {song.mood && <Badge>{song.mood}</Badge>}
          {song.origin && <Badge>{song.origin}</Badge>}
        </div>

        <button
          type="button"
          onClick={handleToggleSimilar}
          aria-label={similarOpen ? "Skrij podobne skladbe" : "Najdi podobne skladbe"}
          title="Najdi podobne skladbe"
          aria-expanded={similarOpen}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none backdrop-blur-sm transition ${
            similarOpen
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "border-neutral-300 bg-white/70 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-emerald-400"
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
            className="h-[11px] w-[11px] shrink-0"
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
    <span className="shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-[10px] leading-none text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </span>
  );
}
