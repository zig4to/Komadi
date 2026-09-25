"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChordsButtons from "@/components/ChordsButtons";
import { authorAccentHsl } from "@/lib/authorColor";
import { PORTRAIT_FOCUS_Y } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { SimilarSong, Song, SongReport } from "@/types/song";

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
  onReported,
  onToggleFavorite,
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
  onReported?: (report: SongReport) => void;
  onToggleFavorite?: (song: Song) => void;
  highlighted?: boolean;
}) {
  // Podobno (similar-songs) — začasno onemogočeno.
  // const [similarOpen, setSimilarOpen] = useState(false);
  // const [similarLoading, setSimilarLoading] = useState(false);
  // const [similarError, setSimilarError] = useState<string | null>(null);
  // const [similarSongs, setSimilarSongs] = useState<SimilarSong[]>([]);

  // Izbriši/Uredi/Dodaj v Jam so združeni v en meni gumb (hamburger) v
  // zgornjem desnem kotu kartice — enak vzorec kot združen "Akordi" gumb v
  // ChordsButtons.tsx (portal, pozicioniran prek getBoundingClientRect).
  // Pokončna slika avtorja (portret): prikažemo zgornji del namesto sredine,
  // sicer ozek, širok izrez kartice odreže glavo (ljudje so slikani stoje,
  // glava je v zgornji tretjini). Hranimo src, da se ob menjavi slike ne
  // prenese stara vrednost.
  const [portraitSrc, setPortraitSrc] = useState<string | null>(null);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsMenuPos, setActionsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const actionsMenuPanelRef = useRef<HTMLDivElement>(null);

  // "Prijavi napako": kratek obrazec na dnu kartice, zapiše v song_reports
  // (seznam prijav je v SettingsMenu.tsx, "Popravi skladbe").
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmitReport() {
    setReportBusy(true);
    const note = reportNote.trim();
    const { data, error } = await supabase
      .from("song_reports")
      .insert({
        song_id: song.id,
        title: song.title,
        author: song.author,
        note: note || null,
      })
      .select()
      .single();
    setReportBusy(false);
    if (error || !data) {
      setReportMessage({ type: "error", text: error?.message ?? "Prijava ni uspela." });
      return;
    }
    setReportOpen(false);
    setReportNote("");
    setReportMessage({ type: "success", text: "Hvala, napaka je prijavljena." });
    setTimeout(() => setReportMessage(null), 3000);
    onReported?.(data as SongReport);
  }

  useEffect(() => {
    if (!actionsOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!actionsButtonRef.current?.contains(target) && !actionsMenuPanelRef.current?.contains(target)) {
        setActionsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActionsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  // async function fetchSimilar(exclude: SimilarSong[]) {
  //   setSimilarLoading(true);
  //   setSimilarError(null);
  //
  //   const { data, error } = await supabase.functions.invoke("similar-songs", {
  //     body: { title: song.title, author: song.author, exclude },
  //   });
  //
  //   setSimilarLoading(false);
  //
  //   const songs = (data as { songs?: SimilarSong[] } | null)?.songs;
  //   if (error || !songs) {
  //     setSimilarError(
  //       (data as { error?: string } | null)?.error ??
  //         error?.message ??
  //         "Predlogov ni bilo mogoče pridobiti.",
  //     );
  //     return;
  //   }
  //   setSimilarSongs(songs);
  // }
  //
  // function handleToggleSimilar() {
  //   if (similarOpen) {
  //     setSimilarOpen(false);
  //     return;
  //   }
  //   setSimilarOpen(true);
  //   if (similarSongs.length === 0) fetchSimilar([]);
  // }

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
      className={`relative isolate overflow-hidden rounded-xl border bg-[linear-gradient(135deg,hsl(var(--hue)_var(--s)_var(--l)/0.10),transparent_60%)] px-4 py-3 transition duration-200 hover:-translate-y-0.5 dark:bg-[linear-gradient(135deg,hsl(var(--hue)_var(--s)_var(--l)/0.20),transparent_60%)] lg:min-h-[112px] ${
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
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalHeight > img.naturalWidth) setPortraitSrc(authorImage);
          }}
          className="pointer-events-none absolute inset-y-0 -right-8 h-full w-[63%] object-cover opacity-60 lg:opacity-20"
          style={{
            clipPath: IMAGE_CLIP_PATH,
            zIndex: -1,
            objectPosition: portraitSrc === authorImage ? `right ${PORTRAIT_FOCUS_Y}` : "right center",
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

          {/* Podobno — začasno onemogočeno.
          <div className="mt-0.5 flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs">
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
          */}
        </div>
        <div className="-mr-1.5 shrink-0">
          <button
            ref={actionsButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!actionsOpen) {
                const rect = e.currentTarget.getBoundingClientRect();
                setActionsMenuPos({ top: rect.bottom + 4, left: rect.right - 192 });
              }
              setActionsOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            aria-label="Dejanja za skladbo"
            title="Dejanja"
            className="rounded-full p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
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
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {actionsOpen &&
            actionsMenuPos &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                ref={actionsMenuPanelRef}
                role="menu"
                data-view-portal
                style={{ top: actionsMenuPos.top, left: actionsMenuPos.left }}
                className="fixed z-50 w-48 space-y-0.5 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    onEdit(song);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-sky-600 hover:bg-neutral-100 dark:text-sky-400 dark:hover:bg-neutral-800"
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
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                  </svg>
                  Uredi
                </button>

                {onAddToJam && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionsOpen(false);
                      onAddToJam(song);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-neutral-100 dark:text-violet-400 dark:hover:bg-neutral-800"
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
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Dodaj v Jam
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onDelete(song.id);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-neutral-100 dark:text-red-400 dark:hover:bg-neutral-800"
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
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    Izbriši
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    setReportOpen(true);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-[13px] w-[13px] shrink-0 text-yellow-500 dark:text-yellow-400"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                  Prijavi napako
                </button>

                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onToggleFavorite(song);
                    }}
                    aria-pressed={song.favorite}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill={song.favorite ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-[13px] w-[13px] shrink-0 text-amber-500 dark:text-amber-400"
                    >
                      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
                    </svg>
                    {song.favorite ? "Odstrani iz priljubljenih" : "Priljubljena"}
                  </button>
                )}
              </div>,
              document.body,
            )}
        </div>
      </div>

      <div className="mt-2 hidden min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto text-xs [&>*:nth-child(n+4)]:hidden sm:[&>*:nth-child(n+4)]:inline lg:flex">
        <Badge>{song.genre}</Badge>
        <Badge>{song.era}</Badge>
        {song.mood && <Badge>{song.mood}</Badge>}
        {song.origin && <Badge>{song.origin}</Badge>}
      </div>

      <div className="mt-1 flex w-full min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <ChordsButtons song={song} onChordsClick={onChordsClick} merged />
      </div>

      {reportOpen && (
        <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[13px] w-[13px] shrink-0 text-yellow-500 dark:text-yellow-400"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            Prijavi napako
          </p>
          <textarea
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            placeholder="Kaj je narobe? (neobvezno)"
            rows={2}
            autoFocus
            className="w-full resize-none rounded-lg border border-neutral-300 bg-white/80 px-2 py-1.5 text-sm text-neutral-800 outline-none focus:border-yellow-500 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-100"
          />
          <div className="flex gap-1.5 text-xs">
            <button
              type="button"
              onClick={handleSubmitReport}
              disabled={reportBusy}
              className="flex-1 rounded-lg bg-yellow-500 px-2 py-1.5 font-medium text-neutral-900 hover:bg-yellow-400 disabled:opacity-50"
            >
              {reportBusy ? "Pošiljam…" : "Pošlji"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReportOpen(false);
                setReportNote("");
                setReportMessage(null);
              }}
              disabled={reportBusy}
              className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-neutral-600 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              Prekliči
            </button>
          </div>
        </div>
      )}

      {reportMessage && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 text-xs ${
            reportMessage.type === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {reportMessage.text}
        </p>
      )}

      {/* Podobno — začasno onemogočeno.
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
      */}

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
