"use client";

import { useEffect, useRef, useState } from "react";

// Plavajoča kontrola samodejnega pomikanja (spodaj desno) za celozaslonska
// pregledovalnika akordov — PdfViewer.tsx in ChordsViewer.tsx. Pomika
// element iz scrollRef.
export default function AutoScrollControl({
  scrollRef,
  speedFactor = 1,
  onPlayingChange,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  // Množitelj hitrosti (1 = PDF). Besedilo akordov je gostejše od PDF strani,
  // zato ChordsViewer drsi hitreje pri isti številki na kontroli.
  speedFactor?: number;
  // Ali samodejno pomikanje teče — ChordsViewer med njim skrije zgornji vrstici.
  onPlayingChange?: (playing: boolean) => void;
}) {
  // Samodejno pomikanje: "autoScrollStarted" je enosmerno stikalo (krogec ->
  // kontrolna vrstica), "isPlaying" pa dvosmerni play/pause preklop znotraj
  // te vrstice. "speedRef" zrcali "speed", da RAF zanka spodaj ne bere
  // zastarele vrednosti in se ji zaradi spremembe hitrosti ni treba znova
  // zagnati.
  const [autoScrollStarted, setAutoScrollStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const speedRef = useRef(speed);
  const rafIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  // Natančen (necel) položaj drsenja, ločen od el.scrollTop — brskalnik
  // slednjega zaokroži/obreže na cela števila, zato bi se pri nizkih
  // hitrostih (prirastek < 1px na okvir) drobni delčki vsak okvir izgubili
  // in drsenje bi obtičalo. Ničeln pomeni "ni še sinhronizirano" (prvi
  // okvir po zagonu/nadaljevanju), takrat se postavi na dejanski el.scrollTop.
  const preciseScrollTopRef = useRef<number | null>(null);
  // Ročno drsenje med samodejnim: dokler se uporabnik dotika vsebine (ali
  // vrti kolesce / vleče drsnik), zanka ne piše scrollTop; zadnja zapisana
  // vrednost pa pove, ali se je vsebina medtem premaknila sama (inercijsko
  // drsenje po dotiku) — takrat zanka nadaljuje od novega mesta.
  const userActiveRef = useRef(false);
  const lastWrittenRef = useRef<number | null>(null);

  const onPlayingChangeRef = useRef(onPlayingChange);
  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  });
  useEffect(() => {
    onPlayingChangeRef.current?.(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      userActiveRef.current = true;
    };
    const end = () => {
      userActiveRef.current = false;
    };
    const wheel = () => {
      userActiveRef.current = true;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(end, 200);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("pointerdown", start);
    window.addEventListener("pointerup", end);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      clearTimeout(wheelTimer);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("pointerdown", start);
      window.removeEventListener("pointerup", end);
      el.removeEventListener("wheel", wheel);
    };
  }, [scrollRef]);

  // Mobilni brskalniki `position: fixed` postavijo glede na postavitveni
  // (layout) viewport, ne glede na trenutno "pinch-zoom" približanje — ob
  // približanju/premikanju zato gumb navidezno zdrsi stran iz kota. S
  // sledenjem window.visualViewport izračunamo, za koliko se mora "right"/
  // "bottom" prilagoditi, da vogal navidezno ostane v resničnem spodnjem
  // desnem kotu vidnega dela zaslona. Isti "pinch-zoom" tudi optično poveča
  // ves gumb — s scale(1/zoom), sidranim v lastnem spodnjem desnem vogalu
  // elementa (transform-origin "bottom right"), ohranimo njegovo dejansko
  // velikost na zaslonu nespremenjeno, ne da bi to vplivalo na že izračunan
  // right/bottom položaj tega istega vogala.
  const CORNER_MARGIN = 16;
  const [cornerOffset, setCornerOffset] = useState<{ right: number; bottom: number; scale: number } | null>(
    null,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const layoutWidth = document.documentElement.clientWidth;
      const layoutHeight = document.documentElement.clientHeight;
      setCornerOffset({
        right: layoutWidth - (vv!.offsetLeft + vv!.width) + CORNER_MARGIN,
        bottom: layoutHeight - (vv!.offsetTop + vv!.height) + CORNER_MARGIN,
        scale: vv!.scale,
      });
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const cornerStyle: React.CSSProperties | undefined = cornerOffset
    ? {
        right: cornerOffset.right,
        bottom: cornerOffset.bottom,
        transformOrigin: "bottom right",
        transform: `scale(${1 / cornerOffset.scale})`,
      }
    : undefined;

  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      lastTimestampRef.current = null;
      // Ob naslednjem zagonu naj se ponovno sinhronizira z dejanskim
      // el.scrollTop (uporabnik je lahko med premorom ročno podrsal).
      preciseScrollTopRef.current = null;
      lastWrittenRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      const el = scrollRef.current;
      if (!el) return;
      if (lastTimestampRef.current === null) lastTimestampRef.current = timestamp;
      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      if (userActiveRef.current) {
        preciseScrollTopRef.current = null;
        rafIdRef.current = requestAnimationFrame(step);
        return;
      }
      if (
        preciseScrollTopRef.current === null ||
        (lastWrittenRef.current !== null && Math.abs(el.scrollTop - lastWrittenRef.current) > 2)
      ) {
        preciseScrollTopRef.current = el.scrollTop;
      }

      // Privzeta hitrost 5 naj ustreza prejšnjemu tempu hitrosti 2 na stari
      // lestvici (2 * 24/7 ≈ 6.86 px/s), zato množitelj 48/35 (= (2*24/7)/5).
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextScrollTop = preciseScrollTopRef.current + speedRef.current * (48 / 35) * speedFactor * deltaSeconds;

      if (nextScrollTop >= maxScrollTop) {
        preciseScrollTopRef.current = maxScrollTop;
        el.scrollTop = maxScrollTop;
        rafIdRef.current = null;
        setIsPlaying(false);
        return;
      }
      preciseScrollTopRef.current = nextScrollTop;
      el.scrollTop = nextScrollTop;
      lastWrittenRef.current = el.scrollTop;
      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [isPlaying, scrollRef, speedFactor]);

  if (!autoScrollStarted) {
    return (
      <button
        type="button"
        onClick={() => {
          setAutoScrollStarted(true);
          setIsPlaying(true);
        }}
        aria-label="Zaženi samodejno pomikanje"
        title="Zaženi samodejno pomikanje"
        style={cornerStyle}
        className="fixed bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900/90 text-neutral-200 shadow-lg ring-1 ring-white/10 hover:bg-neutral-800 hover:text-white active:scale-95"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
        </svg>
      </button>
    );
  }

  return (
    <div
      style={cornerStyle}
      className="fixed bottom-4 right-4 z-10 flex items-center gap-0.5 rounded-full bg-neutral-900/90 px-1 py-1 text-neutral-200 shadow-lg ring-1 ring-white/10"
    >
      <button
        type="button"
        onClick={() => setSpeed((s) => Math.max(1, s - 1))}
        disabled={speed <= 1}
        aria-label="Počasneje"
        title="Počasneje"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent active:scale-95"
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
          <path d="M5 12h14" />
        </svg>
      </button>

      <span className="w-5 text-center text-xs font-medium tabular-nums select-none">{speed}</span>

      <button
        type="button"
        onClick={() => setSpeed((s) => Math.min(13, s + 1))}
        disabled={speed >= 13}
        aria-label="Hitreje"
        title="Hitreje"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent active:scale-95"
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
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <div className="mx-0.5 h-5 w-px bg-white/15" />

      <button
        type="button"
        onClick={() => setIsPlaying((p) => !p)}
        aria-label={isPlaying ? "Premor" : "Nadaljuj"}
        title={isPlaying ? "Premor" : "Nadaljuj"}
        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white active:scale-95"
      >
        {isPlaying ? (
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
            <path d="M8 5v14M16 5v14" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="h-4 w-4">
            <path d="M8 5v14l11-7-11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
