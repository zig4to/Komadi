"use client";

import { useFlipUpMenu } from "@/lib/useFlipUpMenu";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JamTargetMenu from "@/components/JamTargetMenu";
import ListenButton from "@/components/ListenButton";
import PdfViewer from "@/components/PdfViewer";
import { enterLandscapeFullscreen, hasSamSpili, openChordsViewer } from "@/lib/openChords";

import type { Song } from "@/types/song";

// Kliki na te elemente v kartici ne odprejo izbire akordov (imajo svojo akcijo).
const CARD_INTERACTIVE = "button, a, input, textarea, select, label, summary, [role='menu'], [data-no-card-click]";

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
  onAddToJam,
  onAddToSharedJam,
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
  // Gumb "Dodaj v Jam" v spodnji vrstici izbire akordov (samo kjer ga kartica
  // podpira); z onAddToSharedJam najprej vpraša, kateri Jam.
  onAddToJam?: (song: Song) => void;
  onAddToSharedJam?: (song: Song) => void;
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [jamAnchor, setJamAnchor] = useState<DOMRect | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  // Blizu dna zaslona se meni odpre nad gumbom (useFlipUpMenu).
  useFlipUpMenu(menuPanelRef, menuOpen ? menuPos : null);
  const isChordsPdf = song.chords_url?.toLowerCase().split("?")[0].endsWith(".pdf") ?? false;
  const hasPdfButton = Boolean(song.chords_url && isChordsPdf);
  const sourceCount = [song.chords_source_url, hasPdfButton, song.zabrenkaj_url, song.other_chords_url].filter(Boolean).length;
  // Akordi z druge strani (npr. pesmarica.rs): gumb dobi ime iz domene povezave.
  const otherLabel = song.other_chords_url ? siteLabel(song.other_chords_url) : null;
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
      if ((target as Element).closest?.("[data-view-portal]") && !menuPanelRef.current?.contains(target)) return;
      if (!cardRef.current?.contains(target) && !menuPanelRef.current?.contains(target)) setMenuOpen(false);
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

  // Kartica kot gumb (namesto gumba "Akordi"): klik na kartico (element z
  // data-chords-card, v katerem je ta komponenta) odpre izbiro akordov pod
  // kartico; kliki na gumbe/povezave v kartici gredo naprej kot prej.
  useEffect(() => {
    if (!merged) return;
    const card = rootRef.current?.closest<HTMLElement>("[data-chords-card]") ?? null;
    cardRef.current = card;
    if (!card) return;
    card.classList.add("cursor-pointer");
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-chords-card]") !== card) return;
      const hit = t.closest(CARD_INTERACTIVE);
      if (hit && hit !== card && card.contains(hit)) return;
      if (window.getSelection()?.toString()) return;
      const rect = card.getBoundingClientRect();
      setMenuPos({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
      setMenuOpen((v) => !v);
    };
    card.addEventListener("click", onClick);
    return () => {
      card.removeEventListener("click", onClick);
      card.classList.remove("cursor-pointer");
    };
  }, [merged]);

  // Plošča je fiksna (portal): med pomikanjem in ob spremembi velikosti sledi kartici.
  useEffect(() => {
    if (!menuOpen) return;
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = cardRef.current;
        if (!card) return;
        const r = card.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) {
          setMenuOpen(false);
          return;
        }
        setMenuPos({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
      });
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [menuOpen]);

  // Izbira akordov (Sam Špili, Akordi v aplikaciji, UG, Zabrenkaj, druga stran,
  // PDF, Spletno iskanje) se odpre s klikom na kartico; v kartici ostane samo ♪.
  if (merged) {
    const panelWidth = menuPos ? Math.max(240, Math.min(menuPos.width, 480)) : 240;
    const panelLeft = menuPos
      ? Math.min(Math.max(8, menuAlign === "right" ? menuPos.left + menuPos.width - panelWidth : menuPos.left), window.innerWidth - panelWidth - 8)
      : 0;
    const wide = panelWidth >= 340;
    return (
      <span ref={rootRef} hidden>

        {menuOpen &&
          menuPos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuPanelRef}
              role="menu"
              data-view-portal
              style={{ top: menuPos.bottom + 6, left: panelLeft, width: panelWidth }}
              className="fixed z-50 origin-top animate-chords-drop rounded-2xl border border-amber-400 bg-white p-1.5 shadow-xl dark:border-white/10 dark:glass-menu"
            >
              <div className={wide ? "grid grid-cols-2 gap-0.5" : "space-y-0.5"}>
              {hasSamSpili(song) && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    enterLandscapeFullscreen();
                    openChordsViewer(song.id, "samspili");
                    onChordsClick?.(song);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-orange-500"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M10 8.5v7l5.5-3.5z" />
                  </svg>
                  Sam Špili
                </button>
              )}
              {song.chords_text && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openChordsViewer(song.id);
                    onChordsClick?.(song);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-amber-500"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  Akordi v aplikaciji
                </button>
              )}
              {song.chords_source_url && (
              <a
                href={song.chords_source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setMenuOpen(false);
                  onChordsClick?.(song);
                }}
                className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-orange-500"
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
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
                >
                  <GuitarIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  Zabrenkaj.si
                </a>
              )}
              {song.other_chords_url && (
                <a
                  href={song.other_chords_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setMenuOpen(false);
                    onChordsClick?.(song);
                  }}
                  title={`Akordi na ${otherLabel}`}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
                >
                  <SongbookIcon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className="truncate">{otherLabel}</span>
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
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.08]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-red-500"
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
              </div>
              <div className="my-0.5 border-t border-neutral-200 dark:border-white/[0.08]" />
              <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-1">
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  title="Spletno iskanje"
                  aria-label="Spletno iskanje"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white transition hover:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.1] text-sky-500"
                >
                  <GlobeIcon className="h-4 w-4 shrink-0" />
                </a>
                <ListenButton song={song} large />
                {onAddToJam && (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (onAddToSharedJam) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setJamAnchor((open) => (open ? null : rect));
                        return;
                      }
                      onAddToJam(song);
                      setMenuOpen(false);
                    }}
                    title="Dodaj v Jam"
                    aria-label="Dodaj v Jam"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white transition hover:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.1] text-fuchsia-600 dark:text-fuchsia-400"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </button>
                )}
                {jamAnchor && onAddToJam && onAddToSharedJam && (
                  <JamTargetMenu
                    anchor={jamAnchor}
                    onClose={() => setJamAnchor(null)}
                    onPick={(target) => {
                      setJamAnchor(null);
                      if (target === "private") onAddToJam(song);
                      else onAddToSharedJam(song);
                      setMenuOpen(false);
                    }}
                  />
                )}
              </div>
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
      </span>
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
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-orange-500 hover:text-orange-600 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-neutral-400 dark:hover:text-orange-400"
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
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-emerald-500 hover:text-emerald-600 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-neutral-400 dark:hover:text-emerald-400"
        >
          <GuitarIcon className="h-[11px] w-[11px] shrink-0 text-emerald-600 dark:text-emerald-400" />
          Zabrenkaj.si
        </a>
      )}

      {song.other_chords_url && (
        <a
          href={song.other_chords_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onChordsClick?.(song)}
          title={`Akordi na ${otherLabel}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-violet-500 hover:text-violet-600 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-neutral-400 dark:hover:text-violet-400"
        >
          <SongbookIcon className="h-[11px] w-[11px] shrink-0 text-violet-600 dark:text-violet-400" />
          {otherLabel}
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
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-amber-500 hover:text-amber-600 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-neutral-400 dark:hover:text-amber-400"
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
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/40 bg-white/70 px-1.5 py-0.5 text-[11px] font-medium leading-none text-neutral-500 backdrop-blur-sm transition hover:border-sky-500 hover:text-sky-600 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-neutral-400 dark:hover:text-sky-400"
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
// Ime spletne strani iz povezave za gumb "drugi akordi": domena brez "www."
// (https://www.pesmarica.rs/akordi/… → "pesmarica.rs").
function siteLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www./, "");
  } catch {
    return "Akordi";
  }
}

// Odprta pesmarica (Lucide "book-open") — gumb za akorde z drugih strani.
function SongbookIcon({ className }: { className: string }) {
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
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

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
