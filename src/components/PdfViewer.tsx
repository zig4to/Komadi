"use client";

import { useEffect, useRef, useState } from "react";
import AutoScrollControl from "@/components/AutoScrollControl";

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

      {!loading && !error && <AutoScrollControl scrollRef={scrollRef} />}
    </div>
  );
}
