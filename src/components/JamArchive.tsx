"use client";

import type { JamHistoryEntry, Song } from "@/types/song";

// Arhiv Jama (tabela jam_history): skladbe preteklih Jamov, združene po
// dnevih (en dan ≈ en Jam), najnovejši dan prvi. Skladbe iz knjižnice se
// prikažejo kot običajne kartice (renderSongCard iz Dashboard.tsx), vnosi
// "Skladbe ni" oz. izbrisane skladbe pa kot preprosta kartica.

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("sl-SI", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Slovenska dvojina/množina: 1 skladba, 2 skladbi, 3–4 skladbe, 5+ skladb.
function skladb(n: number) {
  const m = n % 100;
  if (m === 1) return `${n} skladba`;
  if (m === 2) return `${n} skladbi`;
  if (m === 3 || m === 4) return `${n} skladbe`;
  return `${n} skladb`;
}

export default function JamArchive({
  entries,
  songs,
  error,
  renderSongCard,
}: {
  entries: JamHistoryEntry[];
  songs: Song[];
  error: string | null;
  renderSongCard: (song: Song) => React.ReactNode;
}) {
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Arhiv je še prazen. Vsaka skladba, ki jo dodaš v Jam, se shrani sem.
      </p>
    );
  }

  const songById = new Map(songs.map((s) => [s.id, s]));
  // Po dnevih; ista skladba večkrat v istem dnevu se prikaže enkrat.
  const days = new Map<string, JamHistoryEntry[]>();
  for (const e of [...entries].sort((a, b) => a.added_at.localeCompare(b.added_at))) {
    const k = dayKey(e.added_at);
    const list = days.get(k) ?? [];
    const same = (x: JamHistoryEntry) =>
      e.song_id ? x.song_id === e.song_id : !x.song_id && x.title === e.title && x.author === e.author;
    if (!list.some(same)) list.push(e);
    days.set(k, list);
  }
  const sortedDays = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-8">
      {sortedDays.map(([key, list]) => (
        <section key={key}>
          <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {dayLabel(key)}
            <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">{skladb(list.length)}</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => {
              const song = e.song_id ? songById.get(e.song_id) : undefined;
              if (song) return <div key={e.id}>{renderSongCard(song)}</div>;
              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-dashed border-fuchsia-500/40 bg-fuchsia-500/[0.04] px-4 py-3"
                >
                  <p className="truncate text-lg font-medium text-neutral-900 lg:text-base dark:text-neutral-100">{e.title}</p>
                  <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{e.author}</p>
                  <p className="mt-1 text-xs text-fuchsia-700 dark:text-fuchsia-400">Ni v knjižnici</p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
