"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // V razvoju (npm run dev) se ne registrira — sw.js uporablja
    // stale-while-revalidate, kar pomeni, da bi vsaka sprememba med
    // razvojem potrebovala dve osvežitvi (prva posodobi predpomnilnik v
    // ozadju, šele druga pokaže novo stanje). V produkciji (statični
    // izvoz) ostane nespremenjeno.
    if (process.env.NODE_ENV !== "production") return;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch(() => {
        // Aplikacija deluje enako brez service workerja, samo brez offline predpomnjenja.
      });
  }, []);

  return null;
}
