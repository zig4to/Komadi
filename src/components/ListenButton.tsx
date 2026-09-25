"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Song } from "@/types/song";

// Gumb "Poslušaj" (samo ikona note) desno od gumba "Akordi" v
// ChordsButtons.tsx — odpre majhen meni (isti portal+pozicioniranje vzorec kot
// meni "Akordi") s povezavami za poslušanje skladbe. Spotify odpre iskanje
// "avtor naslov" (na telefonu v aplikaciji Spotify), zato deluje za vse
// skladbe brez shranjenih povezav. YouTube odpre shranjen video
// (`youtube_url`) ali, če ga ni, YouTube iskanje. YouTube Music vedno odpre
// iskanje.
export default function ListenButton({
  song,
  menuAlign = "left",
}: {
  song: Song;
  menuAlign?: "left" | "right";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(`${song.author} ${song.title}`)}`;
  // Shranjen video (youtube_url), sicer YouTube iskanje "avtor naslov" — za
  // tuje skladbe z dodanim "lyrics", da so na vrhu videi z besedilom (za
  // petje zraven); slovenske/Yugo ostanejo brez, ker jih je z besedilom malo.
  const isDomestic = song.origin === "Slovenska" || song.origin === "Yugo";
  const youtubeUrl =
    song.youtube_url ??
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${song.author} ${song.title}${isDomestic ? "" : " lyrics"}`,
    )}`;
  // YouTube Music: vedno iskanje "avtor naslov" (brez "lyrics" in brez
  // shranjenega youtube_url — tam so za tuje skladbe lyric videi, YT Music pa
  // besedilo prikaže sam in naj predvaja albumsko različico).
  const youtubeMusicUrl = `https://music.youtube.com/search?q=${encodeURIComponent(
    `${song.author} ${song.title}`,
  )}`;

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

  return (
    <>
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
        aria-label="Poslušaj"
        title="Poslušaj"
        className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/40 bg-white/70 px-1 py-0.5 leading-none text-emerald-600 backdrop-blur-sm transition hover:border-emerald-500 hover:text-emerald-700 dark:border-emerald-400/40 dark:bg-neutral-900/70 dark:text-emerald-400 dark:hover:text-emerald-300"
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
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </button>

      {menuOpen &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuPanelRef}
            role="menu"
            data-view-portal
            style={{ top: menuPos.top, left: menuPos.left, right: menuPos.right }}
            className="fixed z-50 w-36 space-y-0.5 rounded-xl border border-emerald-500 bg-white p-1.5 shadow-xl dark:border-emerald-400/70 dark:bg-neutral-900"
          >
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
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
                className="h-[13px] w-[13px] shrink-0 text-green-500"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M7 9.5c3.5-1 7.5-.7 10.5 1" />
                <path d="M7.5 12.8c3-.8 6-.5 8.5.8" />
                <path d="M8 15.8c2.4-.6 4.6-.4 6.5.6" />
              </svg>
              Spotify
            </a>
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
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
                className="h-[13px] w-[13px] shrink-0 text-red-500"
              >
                <rect x="2" y="5" width="20" height="14" rx="4" />
                <path d="m10 9 5 3-5 3Z" className="fill-black stroke-black dark:fill-white dark:stroke-white" />
              </svg>
              YouTube
            </a>
            <a
              href={youtubeMusicUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
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
                className="h-[13px] w-[13px] shrink-0 text-red-500"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m10 8.5 5.5 3.5-5.5 3.5Z" className="fill-black stroke-black dark:fill-white dark:stroke-white" />
              </svg>
              YouTube Music
            </a>
          </div>,
          document.body,
        )}
    </>
  );
}
