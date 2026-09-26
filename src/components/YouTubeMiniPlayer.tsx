"use client";

import { useEffect, useRef, useState } from "react";

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
        onReady?: () => void;
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

function formatTime(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export default function YouTubeMiniPlayer({
  videoIds,
  watchUrl,
  onPlaying,
}: {
  videoIds: string[];
  watchUrl: string;
  // Video, ki se je res začel predvajati — ChordsViewer si ga zapomni za naslednjič.
  onPlaying?: (videoId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const onPlayingRef = useRef(onPlaying);
  useEffect(() => {
    onPlayingRef.current = onPlaying;
  });
  // Kandidati po vrsti (glej ChordsViewer): ob napaki (101/150 — lastnik ne
  // dovoli vgradnje) naloži naslednjega V ISTI predvajalnik (loadVideoById),
  // brez novega iframea; na koncu pokaže kodo napake.
  const attemptRef = useRef(0);
  const [started, setStarted] = useState(false);
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
  function start() {
    const host = hostRef.current;
    if (!host || started) return;
    setStarted(true);
    setLoading(true);
    loadYouTubeApi().then((YT) => {
      if (!hostRef.current) return;
      const el = document.createElement("div");
      host.appendChild(el);
      playerRef.current = new YT.Player(el, {
        videoId: videoIds[0],
        width: 200,
        height: 200,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, origin: window.location.origin },
        events: {
          onReady: () => playerRef.current?.playVideo(),
          // 1 = predvaja, 2 = premor, 0 = konec
          onStateChange: (e) => {
            setPlaying(e.data === 1);
            // -1 = še ni začel, 3 = nalaga; vse ostalo (tudi 5 = pripravljen, če
            // brskalnik blokira samodejni zagon) pomeni, da gumb spet deluje.
            if (e.data !== -1 && e.data !== 3) setLoading(false);
            if (e.data === 1) {
              setDuration(playerRef.current?.getDuration() ?? 0);
              onPlayingRef.current?.(videoIds[attemptRef.current]);
            }
          },
          onError: (e) => {
            const failedId = videoIds[attemptRef.current];
            console.warn(`YouTube napaka ${e.data} za video ${failedId}`);
            attemptRef.current++;
            const next = videoIds[attemptRef.current];
            if (next) playerRef.current?.loadVideoById(next);
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
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCurrent(playerRef.current?.getCurrentTime() ?? 0), 250);
    return () => clearInterval(id);
  }, [playing]);

  if (errorCode !== null || videoIds.length === 0) {
    return (
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-neutral-400 underline hover:text-white"
      >
        Odpri na YouTubu{errorCode !== null && ` (napaka ${errorCode})`}
      </a>
    );
  }

  const ready = started && !loading;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (!playerRef.current) start();
          else if (playing) playerRef.current.pauseVideo();
          else playerRef.current.playVideo();
        }}
        disabled={loading}
        aria-label={playing ? "Premor" : "Predvajaj"}
        title={playing ? "Premor" : "Predvajaj skladbo"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 disabled:opacity-60 active:scale-95"
      >
        {loading ? (
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
        )}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        step={1}
        value={Math.min(Math.floor(current), Math.floor(duration))}
        onChange={(e) => {
          const t = Number(e.target.value);
          setCurrent(t);
          playerRef.current?.seekTo(t, true);
        }}
        disabled={!ready || duration === 0}
        aria-label="Položaj v skladbi"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-red-500 disabled:opacity-40"
      />
      <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
        {formatTime(current)} / {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={() => setVideoVisible((v) => !v)}
        aria-pressed={videoVisible}
        title={videoVisible ? "Skrij video" : "Pokaži video"}
        className={`shrink-0 rounded p-1 hover:text-white ${videoVisible ? "text-red-400" : "text-neutral-400"}`}
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
    </div>
  );
}
