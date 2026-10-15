"use client";

import { useEffect, useRef, useState } from "react";
import ChordsViewer from "@/components/ChordsViewer";
import { supabase } from "@/lib/supabaseClient";
import { SHARED_VIEW_HEARTBEAT_MS, SHARED_VIEW_STALE_MS, publishRemoteView, type SharedViewMessage } from "@/lib/sharedChordsView";
import { authorAccentHex } from "@/lib/authorColor";
import { initialsOf } from "@/lib/userName";
import type { Song } from "@/types/song";

// Skupni Jam za goste (povezava "?gost=<žeton>", gumb Deli v Jamu): brez
// prijave. Gost se javi kot krogec (Presence "shared-jam-presence") in sledi
// vodji (Broadcast "shared-jam-view") — akordi v aplikaciji ali Sam Špili, kot
// prijavljeni sledilec. Podatki samo prek RPC z žetonom (0040_jam_guest_links.sql);
// brez vodje vidi vrsto Skupnega Jama (samo branje, osvežitev vsakih 5 s).

const NAME_KEY = "komadi:guest:name";
const ID_KEY = "komadi:guest:id";

type Leader = { id: string; name: string; songId: string; since: number; mode: "samspili" | null; seen: number };
type Item = { id: string; song_id: string | null; title: string; author: string; played: boolean; added_at: string; added_by_name: string | null };

function readLocal(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function GuestJam({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [name, setName] = useState<string>(() => readLocal(NAME_KEY) ?? "");
  const [nameDraft, setNameDraft] = useState(name);
  const [guestId] = useState(() => {
    const stored = readLocal(ID_KEY);
    if (stored) return stored;
    const id = `gost-${Math.random().toString(36).slice(2, 10)}`;
    try {
      window.localStorage.setItem(ID_KEY, id);
    } catch {}
    return id;
  });
  const [presence, setPresence] = useState<{ id: string; name: string; guest: boolean }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [leader, setLeader] = useState<Leader | null>(null);
  const leaderRef = useRef<Leader | null>(null);
  const [following, setFollowing] = useState(true);
  const [songs, setSongs] = useState<Record<string, Song>>({});

  useEffect(() => {
    leaderRef.current = leader;
  });

  // Veljavnost žetona.
  useEffect(() => {
    supabase.rpc("guest_link_valid", { p_token: token }).then(({ data, error }) => setValid(!error && data === true));
  }, [token]);

  // Prisotnost (krogec v Jamu).
  useEffect(() => {
    if (!valid || !name) return;
    const channel = supabase.channel("shared-jam-presence", { config: { presence: { key: guestId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string; guest?: boolean }>();
        setPresence(Object.entries(state).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "", guest: !!metas[0]?.guest })));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name, guest: true });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [valid, name, guestId]);

  // Sledenje vodji (ista pravila kot v Dashboard.tsx: "vodi prvi", brez utripa 8 s = odšel).
  useEffect(() => {
    if (!valid || !name) return;
    const channel = supabase.channel("shared-jam-view", { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "view" }, ({ payload }) => {
        const msg = payload as SharedViewMessage;
        const current = leaderRef.current;
        if (msg.type === "close") {
          if (current?.id !== msg.leaderId) return;
          publishRemoteView(null);
          leaderRef.current = null;
          setLeader(null);
          return;
        }
        const stale = !current || Date.now() - current.seen > SHARED_VIEW_STALE_MS;
        const earlier = current && (msg.since < current.since || (msg.since === current.since && msg.leaderId < current.id));
        if (!(stale || current.id === msg.leaderId || earlier)) return;
        publishRemoteView(msg.songId, msg);
        const mode = msg.mode ?? null;
        if (current && !stale && current.id === msg.leaderId && current.songId === msg.songId && current.since === msg.since && current.mode === mode) {
          current.seen = Date.now();
          return;
        }
        const next = { id: msg.leaderId, name: msg.leaderName, songId: msg.songId, since: msg.since, mode, seen: Date.now() };
        leaderRef.current = next;
        setLeader(next);
      })
      .subscribe();
    const beat = setInterval(() => {
      const current = leaderRef.current;
      if (current && Date.now() - current.seen > SHARED_VIEW_STALE_MS) {
        publishRemoteView(null);
        leaderRef.current = null;
        setLeader(null);
      }
    }, SHARED_VIEW_HEARTBEAT_MS);
    return () => {
      clearInterval(beat);
      supabase.removeChannel(channel);
    };
  }, [valid, name]);

  // Skladba vodje (RPC z žetonom).
  const leaderSongId = leader?.songId ?? null;
  useEffect(() => {
    if (!leaderSongId || leaderSongId in songs) return;
    let cancelled = false;
    supabase.rpc("guest_jam_song", { p_token: token, p_song_id: leaderSongId }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : null;
      if (!cancelled && row) setSongs((prev) => ({ ...prev, [row.id]: row as Song }));
    });
    return () => {
      cancelled = true;
    };
  }, [leaderSongId, songs, token]);

  // Vrsta Skupnega Jama (samo branje).
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const load = () =>
      supabase.rpc("guest_shared_jam", { p_token: token }).then(({ data }) => {
        if (!cancelled && Array.isArray(data)) setItems(data as Item[]);
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [valid, token]);

  const viewerSong = leader && following ? songs[leader.songId] : null;
  const unplayed = items.filter((i) => !i.played);

  if (valid === null) return <Shell><p className="text-sm text-neutral-400">Nalagam …</p></Shell>;
  if (!valid) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Povezava je potekla</h1>
        <p className="mt-2 text-sm text-neutral-400">Povezave za goste veljajo 24 ur — prosi za novo.</p>
      </Shell>
    );
  }
  if (!name) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Skupni Jam</h1>
        <p className="mt-1 text-sm text-neutral-400">Vpiši ime — prikazalo se bo kot krogec v Jamu.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = nameDraft.trim();
            if (!v) return;
            try {
              window.localStorage.setItem(NAME_KEY, v);
            } catch {}
            setName(v);
          }}
        >
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Ime"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-fuchsia-400"
          />
          <button type="submit" className="rounded-lg bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white">
            Vstopi
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-fuchsia-400">⚡</span> Skupni Jam
        </h1>
        <div className="flex -space-x-1.5">
          {presence.slice(0, 8).map((p) => (
            <span
              key={p.id}
              title={p.id === guestId ? `${p.name} (ti, gost)` : p.guest ? `${p.name} (gost)` : p.name}
              style={{ backgroundColor: authorAccentHex(p.name || "?") }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-neutral-900 ${p.guest ? "outline-dashed outline-1 outline-offset-1 outline-white/60" : ""}`}
            >
              {initialsOf(p.name)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-400">Prijavljen kot gost: {name}</p>

      {leader && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/10 px-4 py-3 text-left text-sm"
        >
          <span>
            <b>{leader.name || "Nekdo"}</b> ima odprte akorde
          </span>
          <span className="font-semibold text-fuchsia-300">Sledi</span>
        </button>
      )}
      {!leader && <p className="mt-4 text-sm text-neutral-400">Čakam, da kdo v Skupnem Jamu odpre akorde …</p>}

      <ul className="mt-4 space-y-2">
        {items.map((it) => {
          const idx = unplayed.indexOf(it);
          return (
            <li
              key={it.id}
              className={`rounded-xl border px-4 py-3 ${it.played ? "border-white/5 opacity-50" : "border-white/10 bg-white/[0.03]"}`}
            >
              {idx === 0 && <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">Trenutna skladba</p>}
              {idx === 1 && <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Naslednja skladba</p>}
              <p className={`font-medium ${it.played ? "line-through" : ""}`}>{it.title}</p>
              <p className="text-sm text-neutral-400">{it.author}</p>
            </li>
          );
        })}
        {!items.length && <li className="text-sm text-neutral-500">Skupni Jam je prazen.</li>}
      </ul>

      {viewerSong && leader && (
        <ChordsViewer
          key={viewerSong.id + (leader.mode ?? "")}
          song={viewerSong}
          onClose={() => setFollowing(false)}
          samSpili={leader.mode === "samspili"}
          shared={{ role: "follower", leaderName: leader.name, onStopFollowing: () => setFollowing(false) }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-[#0d0d10] text-neutral-100" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-xl px-4 py-6">{children}</div>
    </div>
  );
}
