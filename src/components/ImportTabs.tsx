"use client";

import { useState } from "react";
import type { ImportBatch, ImportReportAdded, Song } from "@/types/song";

// Zavihka "Poročila" in "Zgodovina dodajanja" na strani "Čakalna vrsta"
// (Dashboard.tsx). Vsak zagon skilla dodaj-iz-cakalne-vrste je en uvoz
// (tabela import_batches) s strukturiranim poročilom; skladbe kažejo nanj
// prek songs.import_batch_id.

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("sl-SI")} ob ${d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })}`;
}

// Slovenska dvojina/množina: 1 skladba, 2 skladbi, 3–4 skladbe, 5+ skladb.
function skladb(n: number) {
  const m = n % 100;
  if (m === 1) return `${n} skladba`;
  if (m === 2) return `${n} skladbi`;
  if (m === 3 || m === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

const LINK_LABELS: [keyof NonNullable<ImportReportAdded["links"]>, string][] = [
  ["ug", "UG"],
  ["pdf", "PDF"],
  ["zabrenkaj", "Zabrenkaj"],
  ["youtube", "YouTube"],
  ["youtube_music", "YT Music"],
  ["spotify", "Spotify"],
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "off" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
      : tone === "off"
        ? "border-neutral-300 text-neutral-400 line-through dark:border-neutral-700 dark:text-neutral-500"
        : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300";
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${cls}`}>{children}</span>
  );
}

function EmptyState({ error }: { error: string | null }) {
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  return (
    <p className="text-sm text-neutral-500 dark:text-neutral-400">
      Še ni nobenega uvoza. Uvoz nastane ob vsakem zagonu obdelave čakalne vrste.
    </p>
  );
}

export function ImportReports({ batches, error }: { batches: ImportBatch[]; error: string | null }) {
  // Najnovejše poročilo je privzeto odprto.
  const [openId, setOpenId] = useState<string | null>(null);
  const effectiveOpenId = openId ?? batches[0]?.id ?? null;

  if (batches.length === 0) return <EmptyState error={error} />;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {batches.map((b) => {
        const r = b.report ?? {};
        const added = r.added ?? [];
        const skipped = r.skipped ?? [];
        const remaining = r.remaining ?? [];
        const open = effectiveOpenId === b.id;
        return (
          <div
            key={b.id}
            className="overflow-hidden rounded-2xl border-2 border-fuchsia-500/40 bg-fuchsia-500/[0.04] dark:border-fuchsia-400/30"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? "" : b.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-2 px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">Uvoz {formatDate(b.created_at)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Pill tone="ok">dodano: {skladb(added.length)}</Pill>
                  <Pill>izpuščeno: {skipped.length}</Pill>
                  <Pill>ostalo v vrsti: {remaining.length}</Pill>
                </div>
              </div>
              <Chevron open={open} />
            </button>

            {open && (
              <div className="space-y-4 border-t border-dashed border-fuchsia-500/40 px-4 pb-4 pt-3 text-sm dark:border-fuchsia-400/30">
                {added.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Dodane skladbe</h3>
                    <ul className="space-y-2">
                      {added.map((a, i) => (
                        <li
                          key={a.song_id ?? i}
                          className="rounded-lg border border-neutral-200 bg-white/60 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40"
                        >
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">
                            {a.title} <span className="font-normal text-neutral-500">— {a.author}</span>
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {[a.genre, a.era, a.origin, a.mood].filter(Boolean).map((v) => (
                              <Pill key={v}>{v}</Pill>
                            ))}
                          </div>
                          {a.mood_reason && (
                            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                              Razpoloženje: {a.mood_reason}
                            </p>
                          )}
                          {a.links && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {LINK_LABELS.map(([key, label]) => (
                                <Pill key={key} tone={a.links?.[key] ? "ok" : "off"}>
                                  {label}
                                </Pill>
                              ))}
                            </div>
                          )}
                          {a.note && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">{a.note}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {skipped.length > 0 && (
                  <section className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Izpuščene</h3>
                    <ul className="space-y-1">
                      {skipped.map((s, i) => (
                        <li key={i}>
                          <span className="font-medium">{s.title}</span> — {s.author}
                          <span className="text-neutral-500"> ({s.reason})</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {remaining.length > 0 && (
                  <section className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ostalo v čakalni vrsti</h3>
                    <p className="text-neutral-700 dark:text-neutral-300">
                      {remaining.map((s) => `${s.title} — ${s.author}`).join(", ")}
                    </p>
                  </section>
                )}

                {(r.author_images?.length ?? 0) > 0 && (
                  <section className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Nove slike izvajalcev</h3>
                    <p className="text-neutral-700 dark:text-neutral-300">{r.author_images!.join(", ")}</p>
                  </section>
                )}

                {(r.notes?.length ?? 0) > 0 && (
                  <section className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Opombe</h3>
                    <ul className="list-disc space-y-1 pl-5 text-neutral-700 dark:text-neutral-300">
                      {r.notes!.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ImportHistory({
  batches,
  songs,
  error,
  onEditSong,
  renderEditForm,
}: {
  batches: ImportBatch[];
  songs: Song[];
  error: string | null;
  onEditSong?: (song: Song) => void;
  // Obrazec za urejanje (Dashboard.renderEditForm) — izriše se pod vrstico
  // skladbe, ki se ureja, sicer vrne null.
  renderEditForm?: (song: Song) => React.ReactNode;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  if (batches.length === 0) return <EmptyState error={error} />;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {batches.map((b) => {
        const batchSongs = songs
          .filter((s) => s.import_batch_id === b.id)
          .sort((x, y) => x.title.localeCompare(y.title, "sl"));
        const open = openIds.has(b.id);
        return (
          <div key={b.id} className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() =>
                setOpenIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(b.id)) next.delete(b.id);
                  else next.add(b.id);
                  return next;
                })
              }
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-neutral-100">Uvoz {formatDate(b.created_at)}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{skladb(batchSongs.length)} v knjižnici</p>
              </div>
              <Chevron open={open} />
            </button>
            {open && (
              <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {batchSongs.length === 0 && (
                  <li className="px-4 py-2 text-sm text-neutral-500">Skladbe iz tega uvoza niso več v knjižnici.</li>
                )}
                {batchSongs.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onEditSong?.(s)}
                      title="Uredi skladbo"
                      className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{s.title}</p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{s.author}</p>
                      </div>
                      <span className="hidden shrink-0 gap-1 sm:flex">
                        <Pill>{s.genre}</Pill>
                        <Pill>{s.era}</Pill>
                      </span>
                    </button>
                    {renderEditForm && <div className="px-2 empty:hidden">{renderEditForm(s)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
