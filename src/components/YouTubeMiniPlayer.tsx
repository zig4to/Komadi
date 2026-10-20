"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Mini predvajalnik v zgornji vrstici ChordsViewer.tsx (kot v UG Tabs app):
// YouTube IFrame Player API, lastne kontrole (play/pause, drsnik po dolžini
// skladbe, čas). Sam video je privzeto skrit (ne display:none — takrat se
// predvajalnik ne naloži), z gumbom ga pokažeš kot majhno sličico.

// Minimalni tipi za tisti del YT API-ja, ki ga uporabljamo.
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById(videoId: string): void;
  destroy(): void;
  setVolume(volume: number): void;
  getVolume(): number;
  unMute(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width: number;
      height: number;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT!);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

// ID videa iz youtube.com/watch?v=…, music.youtube.com/watch?v=…, youtu.be/…, /shorts/…
export function youTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Naslov in kanal posnetka za izbirnik (YouTube oEmbed, dovoli CORS, brez
// ključa); predpomnjeno za celo sejo. null = ni podatka (zasebno/izbrisano).
type VideoInfo = { title: string; channel: string } | null;
const videoInfoCache = new Map<string, Promise<VideoInfo>>();
function fetchVideoInfo(id: string): Promise<VideoInfo> {
  let p = videoInfoCache.get(id);
  if (!p) {
    p = fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? { title: String(d.title ?? ""), channel: String(d.author_name ?? "") } : null))
      .catch(() => null);
    videoInfoCache.set(id, p);
  }
  return p;
}

function formatTime(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// Upravljanje predvajalnika od zunaj (ChordsViewer: tap na vrstico med
// pavzo). seekAndPlay predvajalnik po potrebi šele zažene (klik je gesta) in
// skoči, ko začne igrati — tudi pred prvim ▶; currentTime (točen čas, ne zadnji
// 250-ms onTime — za snemanje časov vrstic) vrne null, če še ni zagnan.
export type PlayerController = {
  seekAndPlay: (seconds: number) => boolean;
  currentTime: () => number | null;
  // "Sam Špili" (ChordsViewer): predvajaj — ob prvem klicu ustvari predvajalnik
  // (klic mora priti iz uporabnikovega dotika) — in pavza.
  play: () => void;
  pause: () => void;
  // Preskok za delta sekund (npr. ±5 v "Sam Špili").
  seekBy: (delta: number) => void;
  // Glasnost posnetka 0–100 (shranjena v komadi:chords:volume — skupna za akorde in Sam Špili).
  setVolume: (volume: number) => void;
};

export const VOLUME_KEY = "komadi:chords:volume";
export function readVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_KEY));
    if (window.localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v)) return Math.max(0, Math.min(100, v));
  } catch {}
  return 100;
}

export default function YouTubeMiniPlayer({
  videoIds,
  watchUrl,
  onPlaying,
  floatingHost,
  sliderHost,
  sliderBelow = false,
  sectionMarkers,
  onMarkerClick,
  onTime,
  smartAvailable = false,
  smartOn = false,
  onSmartToggle,
  onUserPlay,
  onSmartPlay,
  preload,
  playMenu,
  controllerRef,
  preferredId = null,
  onSelect,
  lockedNote,
}: {
  videoIds: string[];
  // Preverjena skladba: seznam ima samo zaklenjen posnetek, polja za dodajanje
  // ni — namesto njega ta opomba (ChordsViewer).
  lockedNote?: string;
  watchUrl: string;
  // Video, ki se je res začel predvajati — ChordsViewer si ga zapomni za naslednjič.
  onPlaying?: (videoId: string) => void;
  // "Predvajalnik med pomikanjem": kontrole istega predvajalnika v plavajočem
  // pravokotniku desno (portal v ta element — koren pregledovalnika, da ga
  // pokaže tudi celozaslonski način brskalnika). null = ni prikazan.
  floatingHost?: HTMLElement | null;
  // Drsnik po skladbi (in čas) v lastni vrstici pod zgornjo (ChordsViewer) —
  // portal v ta element; brez njega ostane v vrstici s kontrolami.
  sliderHost?: HTMLElement | null;
  // Računalnik: drsnik tudi tu v sliderHost (vrstica pod gumbi), npr. ob odprtem Impro.
  sliderBelow?: boolean;
  // Računalnik: oznake delov skladbe (Intro, Verse 1 …) na drsniku v tej
  // vrstici, t = čas v posnetku (ChordsViewer); klik skoči na začetek dela.
  sectionMarkers?: { t: number; label: string; line?: number }[];
  // Klik na oznako dela (pregledovalnik pomakne besedilo do tega dela).
  onMarkerClick?: (m: { t: number; label: string; line?: number }) => void;
  // "Pametni predvajalnik": trenutni čas in dolžina videa (ob predvajanju
  // vsakih 250 ms in ob preskoku z drsnikom/gumbi).
  onTime?: (seconds: number, duration: number, playing: boolean) => void;
  // Gumb "Smart play" levo od ▶ (samo, če ima skladba besedilo s časi):
  // zažene predvajanje in vklopi sledenje; ponoven klik sledenje izklopi.
  smartAvailable?: boolean;
  smartOn?: boolean;
  onSmartToggle?: (on: boolean) => void;
  // Uporabnik je s ▶ zagnal predvajanje (klicano v istem kliku, ne ob pavzi in ne
  // pri Smart play) — ChordsViewer vklopi celozaslonsko in samodejno pomikanje.
  onUserPlay?: () => void;
  // Uporabnik je vklopil Smart play (klicano v istem kliku) — ChordsViewer vklopi celozaslonsko.
  onSmartPlay?: () => void;
  // Računalnik: predvajalnik se ustvari (ustavljen) malo po odprtju, da prvi ▶ v istem
  // kliku zaigra in vklopi celozaslonski način (ob ustvarjanju v kliku bi ga ta porabil).
  preload?: boolean;
  // ▶ in Smart play (ko skladba ne igra) odpreta mali meni: "Predvajaj" / "Celozaslonsko predvajaj".
  playMenu?: boolean;
  controllerRef?: React.RefObject<PlayerController | null>;
  // Izbirnik posnetka: izbira se shrani (ChordsViewer → songs.preferred_video_id);
  // onSelect vrne napako ali null, preferredId je trenutno shranjeni posnetek.
  preferredId?: string | null;
  onSelect?: (videoId: string) => Promise<string | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // playerRef = šele pripravljen predvajalnik (onReady) — prej YT.Player še nima
  // metod (playVideo ...). createdRef = ustvarjen, morda še ne pripravljen.
  const playerRef = useRef<YTPlayer | null>(null);
  const createdRef = useRef<YTPlayer | null>(null);
  const onPlayingRef = useRef(onPlaying);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onPlayingRef.current = onPlaying;
    onTimeRef.current = onTime;
  });
  // Kandidati po vrsti (glej ChordsViewer): ob napaki (101/150 — lastnik ne
  // dovoli vgradnje) naloži naslednjega V ISTI predvajalnik (loadVideoById),
  // brez novega iframea; na koncu pokaže kodo napake.
  const attemptRef = useRef(0);
  // Izbirnik posnetka: kandidati iz ChordsViewer + ročno dodani (povezava).
  const [ids, setIds] = useState(videoIds);
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  });
  // Posnetek, ki je naložen v predvajalnik (za kljukico v izbirniku).
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  // full = telefon: čez celo širino zaslona (8 px robova), sicer pod gumbom desno.
  const [pickerPos, setPickerPos] = useState<{ top: number; right: number; full: boolean } | null>(null);
  const [infos, setInfos] = useState<Record<string, VideoInfo | undefined>>({});
  const [customUrl, setCustomUrl] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  // Telefon brez dotika (gesta) ne dovoli samodejnega zagona z zvokom: po
  // samodejnem preklopu na naslednji video ta obvisi v stanju "še ni začel".
  // Če se v 3 s ne začne, gumb vrnemo v ▶ — naslednji dotik ga zažene.
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armStallTimer = () => {
    clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => setLoading(false), 3_000);
  };
  const [started, setStarted] = useState(false);
  // Klik na vrstico pred prvim predvajanjem: predvajalnik se šele ustvari —
  // čas, na katerega naj skoči, ko začne igrati (tudi po preklopu na rezervni video).
  const pendingSeekRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoVisible, setVideoVisible] = useState(false);

  // Predvajalnik (iframe) se ustvari šele ob prvem kliku na play — ne ob
  // odprtju pregledovalnika. YouTube iframe lahko doda svoje vnose v zgodovino
  // brskalnika, kar je med odpiranjem zmedlo useBackableOpen (sistemski
  // "Nazaj") in pregledovalnik se je takoj zaprl.
  // false = predvajalnik se ustvari samo pripravljen (preload) — ob pripravljenosti ne zaigra.
  const autoplayRef = useRef(true);
  const startedRef = useRef(false);
  // Ali je video že kdaj zaigral — do takrat klik na drsnik / oznako dela samo premakne
  // položaj (YouTube bi ob seekTo v stanju "pripravljen" začel predvajati).
  const hasPlayedRef = useRef(false);
  function start(autoplay = true) {
    autoplayRef.current = autoplay;
    const host = hostRef.current;
    // Ref, ne stanje: preload in prvi ▶ v istem trenutku sta ustvarila dva predvajalnika.
    if (!host || started || startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    if (autoplay) setLoading(true);
    setCurrentId(idsRef.current[attemptRef.current]);
    loadYouTubeApi().then((YT) => {
      if (!hostRef.current) return;
      const el = document.createElement("div");
      host.appendChild(el);
      createdRef.current = new YT.Player(el, {
        videoId: idsRef.current[attemptRef.current],
        width: 200,
        height: 200,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: autoplay ? 1 : 0, origin: window.location.origin },
        events: {
          onReady: (e) => {
            // e.target je pripravljen predvajalnik z vsemi metodami (objekt iz
            // konstruktorja jih ob tem trenutku včasih še nima).
            playerRef.current = e.target;
            // Shranjena glasnost (Sam Špili / akordi v aplikaciji, gumba Glasneje/Tišje).
            playerRef.current?.setVolume(readVolume());
            // Dolžina že pred predvajanjem (oznake delov na drsniku takoj po odprtju).
            const readDuration = (tries: number) => {
              const d = playerRef.current?.getDuration() ?? 0;
              if (d > 0) setDuration((prev) => prev || d);
              else if (tries > 0) setTimeout(() => readDuration(tries - 1), 500);
            };
            readDuration(10);
            if (!autoplayRef.current) return;
            if (pendingSeekRef.current != null) playerRef.current?.seekTo(pendingSeekRef.current, true);
            playerRef.current?.playVideo();
            armStallTimer();
          },
          // 1 = predvaja, 2 = premor, 0 = konec
          onStateChange: (e) => {
            setPlaying(e.data === 1);
            // -1 = še ni začel, 3 = nalaga; vse ostalo (tudi 5 = pripravljen, če
            // brskalnik blokira samodejni zagon) pomeni, da gumb spet deluje.
            if (e.data !== -1 && e.data !== 3) {
              clearTimeout(stallTimerRef.current);
              setLoading(false);
            }
            if (e.data === 1) {
              hasPlayedRef.current = true;
              if (pendingSeekRef.current != null) {
                const t = pendingSeekRef.current;
                pendingSeekRef.current = null;
                if (Math.abs((playerRef.current?.getCurrentTime() ?? 0) - t) > 0.5) playerRef.current?.seekTo(t, true);
                setCurrent(t);
              }
              setDuration(playerRef.current?.getDuration() ?? 0);
              onPlayingRef.current?.(idsRef.current[attemptRef.current]);
            }
          },
          onError: (e) => {
            const failedId = idsRef.current[attemptRef.current];
            console.warn(`YouTube napaka ${e.data} za video ${failedId}`);
            setFailedIds((prev) => new Set(prev).add(failedId));
            attemptRef.current++;
            const next = idsRef.current[attemptRef.current];
            if (next) {
              setCurrentId(next);
              createdRef.current?.loadVideoById(next);
              armStallTimer();
            }
            else {
              setLoading(false);
              setErrorCode(e.data);
            }
          },
        },
      });
    });
  }

  useEffect(() => {
    return () => {
      clearTimeout(stallTimerRef.current);
      createdRef.current?.destroy();
      createdRef.current = null;
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCurrent(playerRef.current?.getCurrentTime() ?? 0), 250);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    onTimeRef.current?.(current, duration, playing);
  }, [current, duration, playing]);

  useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      seekAndPlay: (seconds) => {
        const player = playerRef.current;
        if (!player) {
          // Še ni zagnan: zaženi zdaj (klik je uporabnikova gesta) in skoči, ko začne igrati.
          // Pripravljen vnaprej (preload), a še ne nared: onReady naj zaigra.
          pendingSeekRef.current = Math.max(0, seconds);
          autoplayRef.current = true;
          start();
          return true;
        }
        const t = Math.max(0, seconds);
        player.seekTo(t, true);
        setCurrent(t);
        player.playVideo();
        return true;
      },
      currentTime: () => playerRef.current?.getCurrentTime() ?? null,
      play: () => {
        if (!playerRef.current) {
          autoplayRef.current = true;
          start();
        }
        else {
          if (!hasPlayedRef.current && pendingSeekRef.current != null) playerRef.current.seekTo(pendingSeekRef.current, true);
          playerRef.current.playVideo();
        }
      },
      pause: () => playerRef.current?.pauseVideo(),
      seekBy: (delta) => {
        const player = playerRef.current;
        if (!player) return;
        const t = Math.max(0, Math.min(player.getDuration() || Infinity, player.getCurrentTime() + delta));
        player.seekTo(t, true);
        setCurrent(t);
      },
      setVolume: (volume) => {
        const player = playerRef.current;
        if (!player) return;
        player.unMute();
        player.setVolume(volume);
      },
    };
  });

  // Računalnik: pripravi predvajalnik 1,5 s po odprtju (ustavljen).
  useEffect(() => {
    if (!preload || started) return;
    const t = setTimeout(() => start(false), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload]);

  // Izbirnik: naslovi se naložijo ob prvem odprtju.
  useEffect(() => {
    if (!pickerPos) return;
    let cancelled = false;
    for (const id of ids) {
      if (id in infos) continue;
      fetchVideoInfo(id).then((info) => {
        if (!cancelled) setInfos((prev) => ({ ...prev, [id]: info }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [pickerPos, ids, infos]);
  useEffect(() => {
    if (!pickerPos) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pickerRef.current?.contains(t) && !pickerButtonRef.current?.contains(t)) setPickerPos(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pickerPos]);

  // Izbira posnetka: naloži ga v isti predvajalnik (ali ga ob prvem zagonu
  // ustvari z njim); onPlaying si ga zapomni kot prvega za naslednjič.
  function selectVideo(id: string) {
    const index = idsRef.current.indexOf(id);
    if (index < 0) return;
    setPickerPos(null);
    setSaveError(null);
    onSelect?.(id).then((err) => setSaveError(err));
    attemptRef.current = index;
    setErrorCode(null);
    setCurrentId(id);
    const player = playerRef.current;
    if (!player) return start();
    setLoading(true);
    setCurrent(0);
    player.loadVideoById(id);
    armStallTimer();
  }
  function addCustomVideo() {
    const id = youTubeVideoId(customUrl.trim()) ?? (/^[\w-]{11}$/.test(customUrl.trim()) ? customUrl.trim() : null);
    if (!id) {
      setCustomError("To ni povezava do YouTube posnetka.");
      return;
    }
    setCustomError(null);
    setCustomUrl("");
    if (!idsRef.current.includes(id)) {
      const next = [...idsRef.current, id];
      idsRef.current = next;
      setIds(next);
    }
    selectVideo(id);
  }

  // Gumb "Izberi posnetek" + spustni seznam (fixed pod gumbom — zgornja
  // vrstica pregledovalnika ima overflow-hidden).
  const picker = (
    <>
      <button
        ref={pickerButtonRef}
        type="button"
        onClick={(e) => {
          if (pickerPos) return setPickerPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPickerPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), full: window.innerWidth < 1024 });
        }}
        aria-expanded={!!pickerPos}
        aria-label="Izberi posnetek"
        title="Izberi posnetek"
        className={`shrink-0 rounded p-1 hover:text-white ${pickerPos ? "text-amber-400" : "text-neutral-400"}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M3 6h13M3 12h13M3 18h9" />
          <path d="M17 15v6l4-3-4-3z" fill="currentColor" />
        </svg>
      </button>
      {pickerPos && (
        <div
          ref={pickerRef}
          role="listbox"
          aria-label="Posnetki"
          style={pickerPos.full ? { top: pickerPos.top, left: 8, right: 8 } : { top: pickerPos.top, right: pickerPos.right }}
          className={`fixed z-40 ${pickerPos.full ? "" : "w-[min(22rem,calc(100vw-1rem))]"} rounded-xl border border-orange-400 dark:border-white/15 bg-neutral-900 p-1.5 font-sans shadow-xl`}
        >
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-neutral-400">Kateri posnetek naj se predvaja?</p>
          {saveError && <p className="px-2 pb-1 text-[10px] text-red-400">Izbira ni shranjena: {saveError}</p>}
          <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {ids.map((id) => {
              const info = infos[id];
              const active = id === currentId;
              const failed = failedIds.has(id);
              // Pred prvim predvajanjem: posnetek, ki bo zaigral ob ▶.
              const upcoming = !currentId && id === ids.find((x) => !failedIds.has(x));
              const preferred = id === preferredId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => selectVideo(id)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-neutral-800 ${
                      active ? "bg-orange-400/15 ring-1 ring-orange-400" : upcoming ? "ring-1 ring-neutral-600" : ""
                    }`}
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${id}/default.jpg`}
                      alt=""
                      loading="lazy"
                      className="h-9 w-12 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`line-clamp-2 text-xs leading-snug ${active ? "text-amber-400" : "text-neutral-100"}`}>
                        {info === undefined ? "Nalagam …" : info ? info.title : `Posnetek ${id}`}
                      </span>
                      <span className="block truncate text-[10px] text-neutral-500">
                        {failed ? "Ne dovoli predvajanja v aplikaciji" : info?.channel}
                      </span>
                      {/* Oznake: kateri igra zdaj / bo zaigral in kateri je izbran za vse naprave. */}
                      {(active || upcoming || preferred) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {active && (
                            <span className="rounded-full bg-orange-400 px-1.5 py-px text-[10px] font-semibold text-neutral-900">
                              {playing ? "▶ Predvaja se" : "Naložen (pavza)"}
                            </span>
                          )}
                          {upcoming && (
                            <span className="rounded-full border border-neutral-500 px-1.5 py-px text-[10px] font-medium text-neutral-300">
                              Zaigra ob ▶
                            </span>
                          )}
                          {preferred && (
                            <span className="rounded-full border border-emerald-500/70 bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-300">
                              Izbran za vse naprave
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    {active && (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {lockedNote ? (
            <p className="mt-1 border-t border-neutral-800 px-2 pt-1.5 text-[10px] leading-snug text-neutral-400">{lockedNote}</p>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addCustomVideo();
            }}
            className="mt-1 flex gap-1.5 border-t border-neutral-800 px-1 pt-1.5"
          >
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Prilepi YouTube povezavo"
              className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-orange-400 dark:border-white/15"
            />
            <button type="submit" className="shrink-0 rounded-lg border border-orange-400 dark:border-white/15 px-2 text-xs text-amber-400 hover:bg-orange-400/15">
              Predvajaj
            </button>
          </form>
          )}
          {customError && <p className="px-2 pt-1 text-[10px] text-red-400">{customError}</p>}
        </div>
      )}
    </>
  );

  // Noben posnetek ne dela: namesto kontrol povezava na YouTube, izbirnik in
  // skrit predvajalnik (hostRef) ostaneta, da lahko izbereš drug posnetek.
  const failedAll = errorCode !== null || ids.length === 0;

  const ready = started && !loading;

  const togglePlay = () => {
    if (!playerRef.current) {
      autoplayRef.current = true;
      setLoading(true);
      start();
      return;
    }
    else if (playing) playerRef.current.pauseVideo();
    else {
      if (!hasPlayedRef.current && pendingSeekRef.current != null) playerRef.current.seekTo(pendingSeekRef.current, true);
      playerRef.current.playVideo();
    }
  };
  // Mali meni ob ▶ / Smart play: izbira navadnega ali celozaslonskega predvajanja
  // (izbira v meniju je nov klik — celozaslonski način ga sme porabiti).
  const [playMenuAt, setPlayMenuAt] = useState<{ kind: "play" | "smart"; left: number; top: number } | null>(null);
  const openPlayMenu = (kind: "play" | "smart", el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPlayMenuAt({ kind, left: Math.max(8, Math.min(window.innerWidth - 228, r.left)), top: r.bottom + 6 });
  };
  useEffect(() => {
    if (!playMenuAt) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-play-menu]")) setPlayMenuAt(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [playMenuAt]);
  const choosePlay = (fullscreen: boolean) => {
    const kind = playMenuAt?.kind;
    setPlayMenuAt(null);
    if (kind === "smart") {
      onSmartToggle?.(true);
      if (fullscreen) onSmartPlay?.();
      if (!playing) togglePlay();
    } else {
      if (fullscreen) onUserPlay?.();
      togglePlay();
    }
  };
  const playClick = (e: React.MouseEvent<HTMLElement>) => {
    if (playing) return togglePlay();
    if (playMenu) return openPlayMenu("play", e.currentTarget);
    onUserPlay?.();
    togglePlay();
  };
  const seekBy = (delta: number) => {
    const player = playerRef.current;
    if (!player) return;
    const t = Math.max(0, Math.min(duration || Infinity, player.getCurrentTime() + delta));
    player.seekTo(t, true);
    setCurrent(t);
  };
  // Na začetek skladbe (predvajanje se ne ustavi).
  const restart = () => {
    playerRef.current?.seekTo(0, true);
    setCurrent(0);
  };
  const playIcon = loading ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4 animate-spin">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  ) : playing ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M8 5v14l11-7-11-7z" />
    </svg>
  );
  const seekTo = (t: number) => {
    setCurrent(t);
    // Še ni igral: samo zapomni položaj, ▶ začne od tam.
    if (!hasPlayedRef.current) {
      pendingSeekRef.current = t;
      return;
    }
    playerRef.current?.seekTo(t, true);
  };
  // Oznake delov: napis samo, če je dovolj prostora od prejšnjega prikazanega
  // (sicer le črtica z napisom v namigu) — širina drsnika iz ResizeObserverja.
  const [trackEl, setTrackEl] = useState<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    if (!trackEl) return;
    const ro = new ResizeObserver(() => setTrackW(trackEl.clientWidth));
    ro.observe(trackEl);
    return () => ro.disconnect();
  }, [trackEl]);
  // Napisi v dveh vrstah: nad drsnikom, če je tam prostor, sicer pod njim;
  // skrit (samo črtica + namig) šele, ko ni prostora v nobeni. Dolge oznake
  // skrajšane (Interlude 6 → Inter. 6), da se manj prekrivajo.
  const markerItems = (() => {
    if (!sectionMarkers?.length || duration <= 0 || !trackW) return [];
    const lastEnd = [-Infinity, -Infinity];
    return sectionMarkers
      .filter((m) => m.t < duration)
      .map((m) => {
        const x = (m.t / duration) * trackW;
        const short = m.label.replace(/^Interlude/i, "Inter.").replace(/^Pre-?Chorus/i, "Pre-Ch.").replace(/^Instrumental/i, "Instr.");
        // ~5,2 px na znak pri 9 px pisavi + razmik (ob odprtem Impro 7 px — vrstica drsnika je tam povečana)
        const row = x >= lastEnd[0] ? 0 : x >= lastEnd[1] ? 1 : -1;
        if (row >= 0) lastEnd[row] = x + short.length * (sliderBelow ? 4.1 : 5.2) + 6;
        return { ...m, short, left: (m.t / duration) * 100, row };
      });
  })();
  const seekBar = (withMarkers: boolean) => (
    <>
      <div ref={withMarkers ? setTrackEl : undefined} className="relative flex min-w-0 flex-1 items-center">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.min(Math.floor(current), Math.floor(duration))}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!ready || duration === 0}
          aria-label="Položaj v skladbi"
          className="h-1 w-full min-w-0 cursor-pointer accent-orange-400 disabled:opacity-40"
        />
        {withMarkers &&
          ready &&
          markerItems.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                seekTo(m.t);
                onMarkerClick?.(m);
              }}
              title={`${m.label} · ${formatTime(m.t)}`}
              style={{ left: `${m.left}%` }}
              className="group absolute top-1/2 flex h-4 w-2 -translate-x-1/2 -translate-y-1/2 justify-center"
            >
              <span className="h-full w-px bg-neutral-300/60 group-hover:bg-amber-400" />
              {m.row >= 0 && (
                <span
                  className={`absolute left-1/2 whitespace-nowrap ${sliderBelow ? "text-[7px]" : "text-[9px]"} leading-none text-neutral-400 group-hover:text-amber-400 ${m.row === 0 ? "bottom-full mb-px" : "top-full mt-px"}`}
                >
                  {m.short}
                </span>
              )}
            </button>
          ))}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
        {formatTime(current)} / {formatTime(duration)}
      </span>
    </>
  );
  const floatButton =
    "flex h-9 w-9 items-center justify-center rounded-full text-amber-400 transition hover:bg-orange-400/15 disabled:opacity-40 active:scale-95";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {playMenuAt &&
        createPortal(
          <div
            data-play-menu
            data-view-portal
            role="menu"
            style={{ left: playMenuAt.left, top: playMenuAt.top }}
            className="fixed z-[70] w-56 rounded-xl border border-orange-400/60 bg-neutral-900 p-1.5 font-sans text-sm text-neutral-100 shadow-2xl"
          >
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
              {playMenuAt.kind === "smart" ? "Smart play" : "Predvajanje"}
            </p>
            <button type="button" role="menuitem" onClick={() => choosePlay(false)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.08]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-amber-400">
                <path d="M7 4v16l13-8z" />
              </svg>
              Predvajaj
            </button>
            <button type="button" role="menuitem" onClick={() => choosePlay(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.08]">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-400">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
              Celozaslonsko predvajaj
            </button>
          </div>,
          document.body,
        )}
      {failedAll ? (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-400 underline hover:text-white"
        >
          Odpri na YouTubu{errorCode !== null && ` (napaka ${errorCode})`}
        </a>
      ) : (
        <>
          {smartAvailable && (
            <button
              type="button"
              onClick={(e) => {
                if (smartOn) return onSmartToggle?.(false);
                if (playMenu && !playing) return openPlayMenu("smart", e.currentTarget);
                onSmartToggle?.(true);
                onSmartPlay?.();
                if (!playing) togglePlay();
              }}
              disabled={loading}
              aria-pressed={smartOn}
              aria-label={smartOn ? "Izklopi Smart play" : "Smart play: akordi sledijo petju"}
              title={smartOn ? "Izklopi Smart play" : "Smart play: akordi sledijo petju"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 transition disabled:opacity-60 active:scale-95 ${
                smartOn ? "bg-orange-400 text-neutral-900" : "text-amber-400 hover:bg-orange-400/15"
              }`}
            >
              {/* Predvajaj + vrstice besedila. */}
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M3 5.5v7l5.5-3.5L3 5.5z" fill="currentColor" stroke="none" />
                <path d="M12 7h9M12 12h9M3 17h18" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={playClick}
            disabled={loading}
            aria-label={playing ? "Premor" : "Predvajaj"}
            title={playing ? "Premor" : "Predvajaj skladbo"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-amber-400 transition hover:bg-orange-400/15 disabled:opacity-60 active:scale-95"
          >
            {playIcon}
          </button>
          <button
            type="button"
            onClick={restart}
            disabled={!ready}
            aria-label="Na začetek skladbe"
            title="Na začetek skladbe"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-400 dark:border-white/15 text-amber-400 transition hover:bg-orange-400/15 disabled:opacity-40 active:scale-95"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M6 5h2.5v14H6zM20 5v14L9 12l11-7z" />
            </svg>
          </button>

          {/* Računalnik: drsnik v tej vrstici; telefon: v lastni vrstici (sliderHost). */}
          {sliderHost ? (
            !sliderBelow && <div className="hidden min-w-0 flex-1 items-center gap-4 px-3 lg:flex">{seekBar(true)}</div>
          ) : (
            seekBar(true)
          )}

        </>
      )}
      {picker}

      <button
        type="button"
        onClick={() => setVideoVisible((v) => !v)}
        aria-pressed={videoVisible}
        title={videoVisible ? "Skrij video" : "Pokaži video"}
        className={`shrink-0 rounded p-1 hover:text-white ${videoVisible ? "text-amber-400" : "text-neutral-400"}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x="2" y="5" width="15" height="14" rx="2" />
          <path d="m17 10 5-3v10l-5-3" />
        </svg>
      </button>

      {/* Sam YouTube predvajalnik: skrit izven zaslona ali kot sličica spodaj desno pod vrstico. */}
      <div
        ref={hostRef}
        aria-hidden={!videoVisible}
        className={
          videoVisible
            ? "fixed right-3 top-24 z-20 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/10"
            : "pointer-events-none fixed -left-[9999px] top-0 opacity-0"
        }
      />

      {sliderHost &&
        !failedAll &&
        createPortal(<div className="flex w-full items-center gap-2 lg:gap-4">{seekBar(sliderBelow)}</div>, sliderHost)}

      {floatingHost &&
        createPortal(
          <div
            role="group"
            aria-label="Predvajalnik"
            className="fixed right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-orange-400 dark:border-white/15 bg-neutral-900/85 p-1 shadow-lg backdrop-blur"
          >
            <button
              type="button"
              onClick={restart}
              disabled={!ready}
              aria-label="Na začetek skladbe"
              title="Na začetek skladbe"
              className={floatButton}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M6 5h2.5v14H6zM20 5v14L9 12l11-7z" />
              </svg>
            </button>
            <button type="button" onClick={() => seekBy(-10)} disabled={!ready} aria-label="10 s nazaj" title="10 s nazaj" className={floatButton}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M11 6v12l-8.5-6L11 6zm9.5 0v12L12 12l8.5-6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={loading}
              aria-label={playing ? "Premor" : "Predvajaj"}
              title={playing ? "Premor" : "Predvajaj skladbo"}
              className={`${floatButton} border border-orange-400 dark:border-white/15`}
            >
              {playIcon}
            </button>
            <button type="button" onClick={() => seekBy(10)} disabled={!ready} aria-label="10 s naprej" title="10 s naprej" className={floatButton}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M13 6v12l8.5-6L13 6zM3.5 6v12L12 12 3.5 6z" />
              </svg>
            </button>
            <span className="pb-0.5 text-[10px] tabular-nums text-neutral-400">{formatTime(current)}</span>
          </div>,
          floatingHost,
        )}
    </div>
  );
}
