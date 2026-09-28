"use client";

import { Fragment, useMemo, useState } from "react";
import ChordsButtons from "@/components/ChordsButtons";
import { authorAccentHex } from "@/lib/authorColor";
import { useBackableOpen } from "@/lib/useBackableOpen";
import { initialsOf } from "@/lib/userName";
import type { Song } from "@/types/song";

// Ena vrstica Jama: skladba iz knjižnice (song) ali "Skladbe ni" (song null).
// addedByName: kdo jo je dodal (samo Skupni Jam — krogec z začetnicami).
export type JamBoardItem = {
  key: string;
  title: string;
  author: string;
  played: boolean;
  song: Song | null;
  addedByName?: string | null;
};

// Telo Jama — enako za osebni in Skupni Jam (Dashboard.tsx): iskalnik po
// knjižnici, "Skladbe ni", seznam s kljukico "odigrano", oznaki
// Trenutna/Naslednja skladba, akordi in odstranitev.
export default function JamBoard({
  items,
  librarySongs,
  excludeIds,
  onAddSong,
  onQuickAdd,
  onTogglePlayed,
  onRemove,
  onChordsClick,
  showAddedBy = false,
}: {
  items: JamBoardItem[];
  librarySongs: Song[];
  // Skladbe, ki so že v tem Jamu (ne ponudi jih v iskalniku).
  excludeIds: Set<string>;
  onAddSong: (song: Song) => void;
  // Vrne napako ali null.
  onQuickAdd: (title: string, author: string) => Promise<string | null>;
  onTogglePlayed: (item: JamBoardItem) => void;
  onRemove: (item: JamBoardItem) => void;
  onChordsClick?: (song: Song) => void;
  showAddedBy?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddAuthor, setQuickAddAuthor] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  useBackableOpen(pickerOpen, () => setPickerOpen(false));

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [];
    return librarySongs
      .filter((s) => !excludeIds.has(s.id))
      .filter((s) => `${s.title} ${s.author}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [librarySongs, excludeIds, pickerQuery]);

  // "Trenutna"/"Naslednja" oznaki sledita prvima dvema še neobkljukanima
  // skladbama v vrstnem redu vrste.
  const unplayed = items.filter((item) => !item.played);
  const firstUnplayedKey = unplayed[0]?.key ?? null;
  const secondUnplayedKey = unplayed[1]?.key ?? null;

  function addSong(song: Song) {
    setPickerOpen(false);
    setPickerQuery("");
    onAddSong(song);
  }

  async function submitQuickAdd() {
    const title = quickAddTitle.trim();
    const author = quickAddAuthor.trim();
    if (!title || !author) {
      setQuickAddError("Naslov in avtor sta obvezna.");
      return;
    }
    const error = await onQuickAdd(title, author);
    if (error) {
      setQuickAddError(error);
      return;
    }
    setQuickAddOpen(false);
    setQuickAddTitle("");
    setQuickAddAuthor("");
    setQuickAddError(null);
  }

  if (pickerOpen) {
    return (
      <div className="space-y-3">
        <input
          autoFocus
          value={pickerQuery}
          onChange={(e) => setPickerQuery(e.target.value)}
          placeholder="Išči po naslovu ali avtorju…"
          className="w-full rounded-full border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] px-4 py-2 text-sm text-neutral-800 placeholder-neutral-500 transition focus:outline-none dark:border-fuchsia-400/40 dark:text-neutral-200 dark:placeholder-neutral-500"
        />
        {pickerQuery.trim() && pickerResults.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Ni zadetkov.</p>
        )}
        <div className="space-y-1.5">
          {pickerResults.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => addSong(song)}
              className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm hover:border-fuchsia-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-fuchsia-400"
            >
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{song.title}</span>
              <span className="text-neutral-500 dark:text-neutral-400"> — {song.author}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setPickerOpen(false);
            setPickerQuery("");
          }}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Prekliči
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.24)_15%,rgba(192,38,211,0.06)_95%)] dark:border-fuchsia-400/40 dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(192,38,211,0.32)_15%,rgba(192,38,211,0.1)_95%)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Dodaj skladbo v Jam
        </button>

        <button
          type="button"
          onClick={() => {
            setQuickAddOpen(true);
            setQuickAddError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-fuchsia-500 hover:text-fuchsia-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-fuchsia-400 dark:hover:text-fuchsia-400"
        >
          Skladbe ni
        </button>
      </div>

      {quickAddOpen && (
        <div className="space-y-2 rounded-lg border border-fuchsia-500/40 bg-[linear-gradient(115deg,rgba(192,38,211,0.14)_15%,rgba(192,38,211,0.03)_95%)] p-3 dark:border-fuchsia-400/40">
          <input
            autoFocus
            value={quickAddTitle}
            onChange={(e) => setQuickAddTitle(e.target.value)}
            placeholder="Naslov skladbe"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
          />
          <input
            value={quickAddAuthor}
            onChange={(e) => setQuickAddAuthor(e.target.value)}
            placeholder="Avtor"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500"
          />
          {quickAddError && <p className="text-sm text-red-600 dark:text-red-400">{quickAddError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submitQuickAdd}
              className="rounded-full bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500"
            >
              Potrdi
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickAddOpen(false);
                setQuickAddTitle("");
                setQuickAddAuthor("");
                setQuickAddError(null);
              }}
              className="text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Prekliči
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">Jam je še prazen.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <Fragment key={item.key}>
              {item.key === firstUnplayedKey && (
                <p className="flex items-center gap-1.5 pl-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  Trenutna skladba
                </p>
              )}
              {item.key === secondUnplayedKey && (
                <p className="flex items-center gap-1.5 pl-1 text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  Naslednja skladba
                </p>
              )}
              <div
                className={`flex items-center gap-2 rounded-full border bg-white py-2 pl-2 dark:bg-neutral-900 ${showAddedBy ? "pr-2" : "pr-4"} ${
                  item.key === firstUnplayedKey
                    ? "border-emerald-400 dark:border-emerald-600"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span
                  className={`w-6 shrink-0 text-right text-lg font-semibold ${
                    item.key === secondUnplayedKey
                      ? "text-sky-600 dark:text-sky-400"
                      : item.played
                        ? "text-neutral-300 dark:text-neutral-700"
                        : "text-neutral-400 dark:text-neutral-600"
                  }`}
                >
                  {i + 1}
                </span>
                <input
                  type="checkbox"
                  checked={item.played}
                  onChange={() => onTogglePlayed(item)}
                  className="h-4 w-4 shrink-0 rounded border-neutral-300 text-fuchsia-600 focus:ring-fuchsia-500 dark:border-neutral-700 dark:bg-neutral-800"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      item.played
                        ? "text-neutral-400 line-through dark:text-neutral-600"
                        : item.key === secondUnplayedKey
                          ? "text-sky-600 dark:text-sky-400"
                          : "text-neutral-900 dark:text-neutral-100"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{item.author}</p>
                </div>
                {item.song && (
                  <ChordsButtons song={item.song} onChordsClick={onChordsClick} stacked merged menuAlign="right" />
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label="Odstrani iz Jama"
                  title="Odstrani iz Jama"
                  className="-ml-0.5 shrink-0 p-1 text-neutral-400 hover:text-red-600 dark:text-neutral-500 dark:hover:text-red-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
                {showAddedBy && (
                  // Kdo je skladbo dodal v Skupni Jam: začetnici, barva po imenu.
                  <span
                    title={item.addedByName ? `Dodal/a: ${item.addedByName}` : "Dodal/a: neznano"}
                    style={{ backgroundColor: authorAccentHex(item.addedByName || "?") }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide text-white"
                  >
                    {initialsOf(item.addedByName ?? "")}
                  </span>
                )}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
