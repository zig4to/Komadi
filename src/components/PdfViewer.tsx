"use client";

import { useEffect, useRef, useState } from "react";

// Izriše PDF neposredno v aplikaciji prek pdfjs-dist (vsaka stran kot
// <canvas>), namesto da bi ga prepustili brskalniku/OS-u — na marsikaterem
// mobilnem brskalniku (predvsem Android) namreč PDF v <iframe> ne izriše
// vgrajenega pregledovalnika, ampak datoteko samo prenese in ponudi
// odpiranje z zunanjo aplikacijo. Z lastnim izrisom v canvas se to ne zgodi
// nikoli, ne glede na platformo.
export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

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
      return;
    }

    const step = (timestamp: number) => {
      const el = scrollRef.current;
      if (!el) return;
      if (lastTimestampRef.current === null) lastTimestampRef.current = timestamp;
      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      if (preciseScrollTopRef.current === null) preciseScrollTopRef.current = el.scrollTop;

      // Privzeta hitrost 5 naj ustreza prejšnjemu tempu hitrosti 2 na stari
      // lestvici (2 * 24/7 ≈ 6.86 px/s), zato množitelj 48/35 (= (2*24/7)/5).
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextScrollTop = preciseScrollTopRef.current + speedRef.current * (48 / 35) * deltaSeconds;

      if (nextScrollTop >= maxScrollTop) {
        preciseScrollTopRef.current = maxScrollTop;
        el.scrollTop = maxScrollTop;
        rafIdRef.current = null;
        setIsPlaying(false);
        return;
      }
      preciseScrollTopRef.current = nextScrollTop;
      el.scrollTop = nextScrollTop;
      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      lastTimestampRef.current = null;
    };
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          // Vsaj 3x tudi na navadnih (DPR 1) zaslonih, da je besedilo ostreje
          // izrisano kot pri golem devicePixelRatio — brez vpliva na velikost
          // shranjene PDF datoteke, ker se izris zgodi šele tu v brskalniku.
          const outputScale = Math.max(window.devicePixelRatio || 1, 3);
          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = container.clientWidth || 800;
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto mb-3 block max-w-full rounded shadow-lg";
          container.appendChild(canvas);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
          await page.render({ canvas, canvasContext: ctx, viewport, transform }).promise;
          if (cancelled) return;
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nalaganje PDF-ja ni uspelo.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-3">
      {loading && <p className="py-8 text-center text-sm text-neutral-300">Nalagam…</p>}
      {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}
      <div ref={containerRef} />

      {!loading && !error && !autoScrollStarted && (
        <button
          type="button"
          onClick={() => {
            setAutoScrollStarted(true);
            setIsPlaying(true);
          }}
          aria-label="Zaženi samodejno pomikanje"
          title="Zaženi samodejno pomikanje"
          style={cornerStyle}
          className="fixed bottom-4 right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900/90 text-neutral-200 shadow-lg ring-1 ring-white/10 hover:bg-neutral-800 hover:text-white active:scale-95"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}

      {!loading && !error && autoScrollStarted && (
        <div
          style={cornerStyle}
          className="fixed bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-neutral-900/90 px-2 py-2 text-neutral-200 shadow-lg ring-1 ring-white/10"
        >
          <button
            type="button"
            onClick={() => setSpeed((s) => Math.max(1, s - 1))}
            disabled={speed <= 1}
            aria-label="Počasneje"
            title="Počasneje"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent active:scale-95"
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
              <path d="M5 12h14" />
            </svg>
          </button>

          <span className="w-6 text-center text-sm font-medium tabular-nums select-none">{speed}</span>

          <button
            type="button"
            onClick={() => setSpeed((s) => Math.min(13, s + 1))}
            disabled={speed >= 13}
            aria-label="Hitreje"
            title="Hitreje"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent active:scale-95"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <div className="mx-1 h-6 w-px bg-white/15" />

          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? "Premor" : "Nadaljuj"}
            title={isPlaying ? "Premor" : "Nadaljuj"}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-neutral-800 hover:text-white active:scale-95"
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
                className="h-5 w-5"
              >
                <path d="M8 5v14M16 5v14" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="h-5 w-5">
                <path d="M8 5v14l11-7-11-7z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
