"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { ERAS, GENRES } from "@/lib/constants";
import { emptyFilters, hasActiveFilters, type FilterState } from "@/lib/filters";

// Zapomni si odprto/zaprto stanje v brskalniku (localStorage), da ostane
// enako tudi po osvežitvi strani. useSyncExternalStore poskrbi, da se
// strežniški in prvi odjemalčev izris ujemata (brez hydration napak).
const STORE_EVENT = "komadi-storage";

function usePersistentBool(key: string, fallback: boolean) {
  const read = useCallback(() => {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v === "1";
    } catch {
      return fallback;
    }
  }, [key, fallback]);

  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(STORE_EVENT, cb);
    return () => window.removeEventListener(STORE_EVENT, cb);
  }, []);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(read()) : next;
      try {
        window.localStorage.setItem(key, resolved ? "1" : "0");
      } catch {
        // pisanje ni mogoče — tiho ignoriramo
      }
      window.dispatchEvent(new Event(STORE_EVENT));
    },
    [key, read],
  );

  return [value, setValue] as const;
}

export default function Filters({
  filters,
  onChange,
  resultCount,
  moodOptions,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
  moodOptions: string[];
}) {
  const [open, setOpen] = usePersistentBool("komadi:filters:open", false);

  function toggleValue(key: "genres" | "eras" | "moods", value: string) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  return (
    <div
      onClick={() => {
        if (!open) setOpen(true);
      }}
      className={`rounded-xl border border-neutral-200 bg-white px-5 py-3 space-y-4 dark:border-neutral-800 dark:bg-neutral-900 ${
        open ? "" : "cursor-pointer"
      }`}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
      >
        <span>
          Filtri{"  "}
          <span className="ml-2 font-normal text-neutral-500">
            ({resultCount} {resultCount === 1 ? "skladba" : "skladb"})
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {open && hasActiveFilters(filters) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(emptyFilters);
              }}
              className="text-xs font-normal text-neutral-500 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
            >
              Počisti filtre
            </button>
          )}
          <Chevron open={open} className="h-4 w-4" />
        </span>
      </div>

      {open && (
        <>
          <input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Išči po naslovu ali avtorju…"
            className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />

          <Section
            title="Žanr"
            count={filters.genres.length}
            storageKey="komadi:filters:genre"
          >
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <Chip
                  key={g}
                  active={filters.genres.includes(g)}
                  onClick={() => toggleValue("genres", g)}
                  label={g}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Obdobje"
            count={filters.eras.length}
            storageKey="komadi:filters:era"
          >
            <div className="flex flex-wrap gap-2">
              {ERAS.map((era) => (
                <Chip
                  key={era}
                  active={filters.eras.includes(era)}
                  onClick={() => toggleValue("eras", era)}
                  label={era}
                />
              ))}
            </div>
          </Section>

          {moodOptions.length > 0 && (
            <Section
              title="Razpoloženje"
              count={filters.moods.length}
              storageKey="komadi:filters:mood"
            >
              <div className="flex flex-wrap gap-2">
                {moodOptions.map((mood) => (
                  <Chip
                    key={mood}
                    active={filters.moods.includes(mood)}
                    onClick={() => toggleValue("moods", mood)}
                    label={mood}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Več možnosti"
            defaultOpen={false}
            storageKey="komadi:filters:more"
          >
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={filters.favoriteOnly}
                onChange={(e) =>
                  onChange({ ...filters, favoriteOnly: e.target.checked })
                }
                className="h-4 w-4 rounded border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800"
              />
              Samo priljubljene
            </label>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = true,
  storageKey,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  storageKey: string;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistentBool(storageKey, defaultOpen);
  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
      >
        <span>
          {title}
          {count ? (
            <span className="ml-2 font-normal text-neutral-500">({count})</span>
          ) : null}
        </span>
        <Chevron open={open} className="h-4 w-4" />
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"} ${
        className ?? ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
