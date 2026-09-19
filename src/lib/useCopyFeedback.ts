"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

// Kopira besedilo in za `duration` ms izpostavi `copied`, da lahko
// komponenta prikaže kratko vizualno potrditev ("kopirano").
export function useCopyFeedback(duration = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function trigger(text: string): Promise<boolean> {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), duration);
    }
    return ok;
  }

  return [copied, trigger] as const;
}
