"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PdfViewer from "@/components/PdfViewer";
import { authorAccentHsl } from "@/lib/authorColor";
import { supabase } from "@/lib/supabaseClient";
import { useBackableOpen } from "@/lib/useBackableOpen";
import type { SimilarSong, Song } from "@/types/song";

// Diagonalna "zagozda" s sliko na desni strani kartice — enak pristop kot
// eventCard/eventCardImage v projektu masCajt (styles.js): clip-path izreže
// nagnjen štirikotnik (širši zgoraj, ožji spodaj), opacity pa sliko "potopi"
// v barvo kartice namesto da bi bila prilepljena na vrhu.
const IMAGE_CLIP_PATH = "polygon(20% 0, 100% 0, 100% 100%, 10% 100%)";

export default function SongCard({
  song,
  authorImage = null,
  onEdit,
  onDelete,
  onAddSimilar,
  onFilterAuthor,
  onAddToJam,
  onChordsClick,
  highlighted = false,
}: {
  song: Song;
  authorImage?: string | null;
  onEdit: (song: Song) => void;
  onDelete?: (id: string) => void;
  onAddSimilar?: (song: SimilarSong) => void;
  onFilterAuthor?: (author: string) => void;
  onChordsClick?: (song: Song) => void;
  onAddToJam?: (song: Song) => void;
  highlighted?: boolean;
}) {
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarSongs, setSimilarSongs] = useState<SimilarSong[]>([]);
  const [pdfOpen, setPdfOpen] = useState(false);

  // Sistemski gumb "Nazaj" (Android) naj PDF pregled zapre enako kot klik na "✕".
  useBackableOpen(pdfOpen, () => setPdfOpen(false));

  // Akordi so lahko zunanja povezava (npr. Ultimate Guitar — odpre se v
  // novem zavihku) ali naložen PDF (odpre se v celozaslonskem pregledu
  // znotraj aplikacije).
  const isChordsPdf = song.chords_url?.toLowerCase().split("?")[0].endsWith(".pdf") ?? false;

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
  // stabilna barva (h/s/l) iz imena avtorja — tako imajo vse skladbe istega
  // avtorja enako barvno shemo (isto barvo uporabimo tudi za obrobo/senco
  // spodaj in za delni gradient ozadja, glej className). Obroba je manj
  // nasičena/temnejša od osnovne barve, da ne "kriči" enako glasno.
  const { h, s, l } = highlighted ? { h: 152, s: 70, l: 42 } : authorAccentHsl(song.author);
  const borderS = Math.max(s - 35, 0);
  const borderL = Math.max(l - 13, 12);
  const cardStyle = {
    boxShadow: highlighted
      ? "0 12px 36px -18px rgb(16 185 129 / 0.16), 0 2px 8px -6px rgb(0 0 0 / 0.32)"
      : `0 12px 36px -20px hsl(${h} ${s}% ${l}% / 0.13), 0 2px 8px -7px rgb(0 0 0 / 0.32)`,
    borderColor: highlighted ? undefined : `hsl(${h} ${borderS}% ${borderL}% / 0.4)`,
    "--hue": h,
    "--s": `${s}%`,
    "--l": `${l}%`,
  } as React.CSSProperties;

  return (
    <div
      style={cardStyle}
      className={`relative isolate overflow-hidden rounded-xl border bg-[linear-gradient(135deg,hsl(var(--hue)_var(--s)_var(--l)/0.10),transparent_60%)] p-4 transition duration-200 hover:-translate-y-0.5 dark:bg-[linear-gradient(135deg,hsl(var(--hue)_var(--s)_var(--l)/0.20),transparent_60%)] lg:min-h-[154px] ${
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
          className="pointer-events-none absolute inset-y-0 -right-8 h-full w-[63%] object-cover object-right opacity-60 lg:opacity-20"
          style={{
            clipPath: IMAGE_CLIP_PATH,
            zIndex: -1,
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium text-neutral-900 lg:text-base dark:text-neutral-100">
            {song.title}
          </p>
          <button
            type="button"
            onClick={() => onFilterAuthor?.(song.author)}
            title={`Prikaži vse skladbe izvajalca ${song.author}`}
            className="block max-w-full truncate text-left text-sm text-neutral-500 hover:text-emerald-600 hover:underline dark:text-neutral-400 dark:hover:text-emerald-400"
          >
            {song.author}
          </button>

          {song.chords_source_url && (
            <a
              href={song.chords_source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onChordsClick?.(song)}
              title="Odpri na Ultimate Guitar"
              className="mt-1.5 inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-orange-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-orange-500 hover:text-orange-600 dark:border-orange-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-orange-400 lg:gap-1.5 lg:border-2 lg:border-orange-500/70 lg:px-2.5 lg:py-1 lg:text-[13px] dark:lg:border-orange-400/70"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[11px] w-[11px] shrink-0 lg:h-[13px] lg:w-[13px]"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
              </svg>
              UG Tabs
            </a>
          )}

          <div className="mt-0.5 flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs">
            {song.chords_url && isChordsPdf && (
              <button
                type="button"
                onClick={() => {
                  setPdfOpen(true);
                  onChordsClick?.(song);
                }}
                title="Odpri PDF akorde"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-amber-500 hover:text-amber-600 dark:border-amber-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-amber-400 lg:gap-1.5 lg:border-2 lg:border-amber-500/70 lg:px-2.5 lg:py-1 lg:text-[13px] dark:lg:border-amber-400/70"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[11px] w-[11px] shrink-0 lg:h-[13px] lg:w-[13px]"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                PDF akordi
              </button>
            )}

            {song.chords_url && !isChordsPdf && !song.chords_source_url && (
              <a
                href={song.chords_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Odpri akorde"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-amber-500 hover:text-amber-600 dark:border-amber-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-amber-400 lg:gap-1.5 lg:border-2 lg:border-amber-500/70 lg:px-2.5 lg:py-1 lg:text-[13px] dark:lg:border-amber-400/70"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[11px] w-[11px] shrink-0 lg:h-[13px] lg:w-[13px]"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                Akordi
              </a>
            )}

            <button
              type="button"
              onClick={handleToggleSimilar}
              aria-label={similarOpen ? "Skrij podobne skladbe" : "Najdi podobne skladbe"}
              title="Najdi podobne skladbe"
              aria-expanded={similarOpen}
              className={`inline-flex shrink-0 items-center justify-center rounded-full border p-1 backdrop-blur-sm transition lg:border-2 lg:p-1.5 ${
                similarOpen
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "border-neutral-300 bg-white/70 text-neutral-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-emerald-400 lg:border-neutral-400 dark:lg:border-neutral-500"
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
                className="h-[11px] w-[11px] shrink-0 lg:h-[13px] lg:w-[13px]"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          </div>
        </div>
        <div className="-mr-1.5 flex shrink-0 flex-col items-center gap-0">
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(song.id)}
              aria-label="Izbriši skladbo"
              title="Izbriši skladbo"
              className="p-1.5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
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

          <button
            type="button"
            onClick={() => onEdit(song)}
            aria-label="Uredi skladbo"
            title="Uredi skladbo"
            className="p-1.5 text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
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

          {onAddToJam && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToJam(song);
              }}
              aria-label="Dodaj v Jam"
              title="Dodaj v Jam"
              className="p-1.5 text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 hidden min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto text-xs [&>*:nth-child(n+4)]:hidden sm:[&>*:nth-child(n+4)]:inline lg:flex">
        <Badge>{song.genre}</Badge>
        <Badge>{song.era}</Badge>
        {song.mood && <Badge>{song.mood}</Badge>}
        {song.origin && <Badge>{song.origin}</Badge>}
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

      {pdfOpen &&
        song.chords_url &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex flex-col bg-black/90"
          >
            <div className="flex shrink-0 items-center justify-between bg-neutral-900 px-4 py-2.5">
              <span className="truncate text-sm font-medium text-white">
                {song.title} — akordi
              </span>
              <button
                type="button"
                onClick={() => setPdfOpen(false)}
                aria-label="Zapri"
                title="Zapri"
                className="shrink-0 p-1 text-neutral-300 hover:text-white"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-neutral-800">
              <PdfViewer url={song.chords_url} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-[11px] leading-none text-neutral-500 dark:border-neutral-700 dark:text-neutral-400 lg:border-neutral-400 dark:lg:border-neutral-500">
      {children}
    </span>
  );
}
