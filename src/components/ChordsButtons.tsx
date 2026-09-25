"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ListenButton from "@/components/ListenButton";
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
  merged = false,
  menuAlign = "left",
}: {
  song: Song;
  onChordsClick?: (song: Song) => void;
  // Namesto vodoravne vrstice pod naslovom (privzeto) razporedi gumba
  // navpično, enega nad drugim — za uporabo v ozkih vrsticah, kjer gresta
  // gumba v svoj stolpec ob strani (npr. CompactRow na "Popularno").
  stacked?: boolean;
  // Kadar sta na voljo oba vira, ju prikaži kot en gumb "Akordi", ki ob
  // kliku odpre majhen meni z obema možnostma (namesto dveh ločenih
  // gumbov drug ob drugem) — uporabljeno v FeaturedArtists.tsx.
  merged?: boolean;
  // Stran gumba, s katero naj se poravna odprt meni — "left" (privzeto) za
  // gumbe bližje levemu robu (SongCard, FeaturedArtists), "right" kadar je
  // gumb tik ob desnem robu vrstice (CompactRow na "Popularno"), da se meni
  // ne razteza čez desni rob zaslona.
  menuAlign?: "left" | "right";
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const isChordsPdf = song.chords_url?.toLowerCase().split("?")[0].endsWith(".pdf") ?? false;
  const hasPdfButton = Boolean(song.chords_url && isChordsPdf);
  const sourceCount = [song.chords_source_url, hasPdfButton, song.zabrenkaj_url].filter(Boolean).length;
  // "Spletno iskanje" ima vsaka skladba — Google iskanje "avtor naslov
  // Akordi" (slovenske/Yugo) oz. "... Chords" (ostale). Odpre se v novem
  // zavihku: v nameščeni PWA na Androidu je to brskalnik (Custom Tab), ki se
  // izriše nad aplikacijo. <iframe> ni mogoč, ker Google prepoveduje vgradnjo
  // (X-Frame-Options).
  const searchWord = song.origin === "Slovenska" || song.origin === "Yugo" ? "Akordi" : "Chords";
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${song.author} ${song.title} ${searchWord}`)}`;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !menuPanelRef.current?.contains(target)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Združen meni "Akordi" se prikaže, kadar je poleg spletnega iskanja na
  // voljo vsaj en vir (UG / PDF / Zabrenkaj); brez virov ostane samo gumb
  // "Spletno iskanje".
  if (merged && sourceCount >= 1) {
    return (
      <div className={stacked ? "flex shrink-0 items-center gap-1" : "mt-1 flex items-center gap-1"}>
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!menuOpen) {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuPos(
                menuAlign === "right"
                  ? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
                  : { top: rect.bottom + 4, left: rect.left },
              );
            }
            setMenuOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Akordi"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-amber-500 hover:text-amber-600 dark:border-amber-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-amber-400"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[15px] w-[15px] shrink-0"
          >
            <rect x="5" y="3" width="14" height="18" rx="1.5" />
            <path d="M9.7 3v18M14.3 3v18M5 8.5h14M5 14h14" />
            <circle cx="9.7" cy="11.2" r="1.3" />
            <circle cx="14.3" cy="16.8" r="1.3" />
          </svg>
          Akordi
        </button>
        <ListenButton song={song} menuAlign={menuAlign} />

        {menuOpen &&
          menuPos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuPanelRef}
              role="menu"
              data-view-portal
              style={{ top: menuPos.top, left: menuPos.left, right: menuPos.right }}
              className="fixed z-50 w-36 space-y-0.5 rounded-xl border border-amber-400 bg-white p-1.5 shadow-xl dark:border-amber-400/70 dark:bg-neutral-900"
            >
              {song.chords_source_url && (
              <a
                href={song.chords_source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setMenuOpen(false);
                  onChordsClick?.(song);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[13px] w-[13px] shrink-0 text-orange-500"
                >
                  <path d="M18.1 6.9A8 8 0 1 0 20 12h-7" />
                </svg>
                Ultimate Guitar
              </a>
              )}
              {song.zabrenkaj_url && (
                <a
                  href={song.zabrenkaj_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setMenuOpen(false);
                    onChordsClick?.(song);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <GuitarIcon className="h-[13px] w-[13px] shrink-0 text-emerald-600 dark:text-emerald-400" />
                  Zabrenkaj.si
                </a>
              )}
              {hasPdfButton && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setPdfOpen(true);
                  onChordsClick?.(song);
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[13px] w-[13px] shrink-0 text-red-500"
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  <path d="M16 13H8" />
                  <path d="M16 17H8" />
                  <path d="M10 9H8" />
                </svg>
                PDF akordi
              </button>
              )}
              <div className="my-0.5 border-t border-neutral-200 dark:border-neutral-800" />
              <a
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <GlobeIcon className="h-[13px] w-[13px] shrink-0 text-sky-500" />
                Spletno iskanje
              </a>
            </div>,
            document.body,
          )}

        {pdfOpen &&
          song.chords_url &&
          typeof document !== "undefined" &&
          createPortal(
            <div data-view-portal onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-50 flex flex-col bg-black/90">
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
            <path d="M18.1 6.9A8 8 0 1 0 20 12h-7" />
          </svg>
          UG
        </a>
      )}

      {song.zabrenkaj_url && (
        <a
          href={song.zabrenkaj_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onChordsClick?.(song)}
          title="Odpri na Zabrenkaj.si"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-emerald-500 hover:text-emerald-600 dark:border-emerald-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-emerald-400"
        >
          <GuitarIcon className="h-[11px] w-[11px] shrink-0 text-emerald-600 dark:text-emerald-400" />
          Zabrenkaj.si
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
            className="h-[11px] w-[11px] shrink-0 text-red-500"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
          PDF
        </button>
      )}

      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Spletno iskanje akordov"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-sky-500 hover:text-sky-600 dark:border-sky-400/40 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:text-sky-400"
      >
        <GlobeIcon className="h-[11px] w-[11px] shrink-0 text-sky-500" />
        {sourceCount === 0 ? "Spletno iskanje" : "Splet"}
      </a>

      {merged && <ListenButton song={song} menuAlign={menuAlign} />}

      {pdfOpen &&
        song.chords_url &&
        typeof document !== "undefined" &&
        createPortal(
          <div data-view-portal onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-50 flex flex-col bg-black/90">
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

// Ista ikona kitare kot levo od naslova "Bitne Tabs" v Dashboard.tsx.
function GuitarIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m11.9 12.1 4.514-4.514" />
      <path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z" />
      <path d="m6 16 2 2" />
      <path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z" />
    </svg>
  );
}

// Lucide "globe" — spletno iskanje akordov.
function GlobeIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}
