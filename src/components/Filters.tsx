"use client";

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
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

// Ločen gumb (pill, ista vrsta kot Novo/Popularno) — stanje odprto/zaprto
// si deli s spodnjim Filters (panel) prek istega localStorage ključa +
// dogodka (usePersistentBool), zato ju ni treba ročno sinhronizirati.
export function FiltersToggle({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const [open, setOpen] = usePersistentBool("komadi:filters:open", false);

  return (
    <>
      <button
        type="button"
        data-filters-toggle
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
          open
            ? "bg-[linear-gradient(115deg,#2563eb_15%,#60a5fa_100%)] text-white"
            : "bg-[linear-gradient(115deg,rgba(37,99,235,0.14)_15%,rgba(37,99,235,0.03)_95%)] text-neutral-800 hover:bg-[linear-gradient(115deg,rgba(37,99,235,0.24)_15%,rgba(37,99,235,0.06)_95%)] dark:text-neutral-200 dark:hover:bg-[linear-gradient(115deg,rgba(37,99,235,0.32)_15%,rgba(37,99,235,0.1)_95%)]"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 ${open ? "text-white" : "text-blue-600 dark:text-blue-400"}`}
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filtri
      </button>

      {open && hasActiveFilters(filters) && (
        <button
          type="button"
          data-filters-toggle
          onClick={() => onChange(emptyFilters)}
          className="shrink-0 whitespace-nowrap text-xs text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
        >
          Počisti filtre
        </button>
      )}
    </>
  );
}

// Razširjen panel s filtri — prikazan samo, ko je FiltersToggle zgoraj odprt.
export default function Filters({
  filters,
  onChange,
  moodOptions,
  originOptions,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  moodOptions: string[];
  originOptions: string[];
}) {
  const [open, setOpen] = usePersistentBool("komadi:filters:open", false);

  function toggleValue(key: "genres" | "eras" | "moods" | "origins", value: string) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  // Klik kamorkoli izven gumba Filtri ali tega panela zapre filtre.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-filters-toggle]") || target.closest("[data-filters-panel]")) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      data-filters-panel
      className="mt-3! space-y-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {hasActiveFilters(filters) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange(emptyFilters)}
            className="shrink-0 text-xs text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400"
          >
            Počisti filtre
          </button>
        </div>
      )}

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

          {originOptions.length > 0 && (
            <Section
              title="Izvor"
              count={filters.origins.length}
              storageKey="komadi:filters:origin"
            >
              <div className="flex flex-wrap gap-2">
                {originOptions.map((origin) => (
                  <Chip
                    key={origin}
                    active={filters.origins.includes(origin)}
                    onClick={() => toggleValue("origins", origin)}
                    label={origin}
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
