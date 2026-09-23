"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PdfViewer from "@/components/PdfViewer";
import type { Song } from "@/types/song";

// Skrajšana različica gumbov "UG Tabs"/"PDF akordi" iz SongCard.tsx (samo
// "UG"/"PDF"), za uporabo na kompaktnih karticah (Novo/Popularno/
// Predstavljeno), kjer za polna besedila ni dovolj prostora. Ista logika
// (celozaslonski PDF pregled prek portala) je namenoma podvojena tu namesto
// deljena s SongCard.tsx, da vsaka komponenta ostane samostojna.
export default function ChordsButtons({
  song,
  onChordsClick,
  stacked = false,
}: {
  song: Song;
  onChordsClick?: (song: Song) => void;
  // Namesto vodoravne vrstice pod naslovom (privzeto) razporedi gumba
  // navpično, enega nad drugim — za uporabo v ozkih vrsticah, kjer gresta
  // gumba v svoj stolpec ob strani (npr. CompactRow na "Popularno").
  stacked?: boolean;
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const isChordsPdf = song.chords_url?.toLowerCase().split("?")[0].endsWith(".pdf") ?? false;
  const hasPdfButton = Boolean(song.chords_url && isChordsPdf);

  if (!song.chords_source_url && !hasPdfButton) return null;

  return (
    <div
      className={
        stacked
          ? "flex shrink-0 flex-col items-end gap-1"
          : "mt-1 flex flex-wrap items-center gap-1.5"
      }
    >
      {song.chords_source_url && (
        <a
          href={song.chords_source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onChordsClick?.(song)}
          title="Odpri na Ultimate Guitar"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-orange-500 hover:text-orange-600 dark:border-orange-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-orange-400"
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
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
          UG
        </a>
      )}

      {hasPdfButton && (
        <button
          type="button"
          onClick={() => {
            setPdfOpen(true);
            onChordsClick?.(song);
          }}
          title="Odpri PDF akorde"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-amber-500 hover:text-amber-600 dark:border-amber-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-amber-400"
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
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          PDF
        </button>
      )}

      {pdfOpen &&
        song.chords_url &&
        typeof document !== "undefined" &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-50 flex flex-col bg-black/90">
            <div className="flex shrink-0 items-center justify-between bg-neutral-900 px-4 py-2.5">
              <span className="truncate text-sm font-medium text-white">{song.title} — akordi</span>
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
