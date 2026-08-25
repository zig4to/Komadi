"use client";

import { ERAS, GENRES } from "@/lib/constants";
import { emptyFilters, hasActiveFilters, type FilterState } from "@/lib/filters";

export default function Filters({
  filters,
  onChange,
  resultCount,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}) {
  function toggleValue(key: "genres" | "eras", value: string) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">
          Filtri{" "}
          <span className="font-normal text-neutral-500">
            ({resultCount} {resultCount === 1 ? "skladba" : "skladb"})
          </span>
        </h2>
        {hasActiveFilters(filters) && (
          <button
            onClick={() => onChange(emptyFilters)}
            className="text-xs text-neutral-400 hover:text-emerald-400"
          >
            Počisti filtre
          </button>
        )}
      </div>

      <input
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Išči po naslovu ali avtorju…"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />

      <div>
        <p className="mb-2 text-xs font-medium text-neutral-400">Žanr</p>
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
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-neutral-400">Obdobje</p>
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
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={filters.favoriteOnly}
          onChange={(e) => onChange({ ...filters, favoriteOnly: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-700 bg-neutral-800"
        />
        Samo priljubljene
      </label>
    </div>
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
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
          : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
