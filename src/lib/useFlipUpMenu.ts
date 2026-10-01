"use client";

import { useLayoutEffect, type RefObject } from "react";

const MARGIN = 8;
const GAP = 4;

// Spustni meni v portalu (position: fixed), ki se privzeto odpre pod gumbom:
// če spodaj ni dovolj prostora, ga pred izrisom prestavi nad gumb, če ne gre
// niti tja, ga pripne ob spodnji rob zaslona. Vrh popravi neposredno na
// elementu (brez dodatnega izrisa), ker je višina znana šele po izrisu.
// anchor = getBoundingClientRect() gumba ob odprtju (null = zaprt).
export function useFlipUpMenu(panelRef: RefObject<HTMLElement | null>, anchor: { top: number; bottom: number } | null) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchor) return;
    const h = panel.offsetHeight;
    const below = anchor.bottom + GAP;
    let top = below;
    if (below + h > window.innerHeight - MARGIN) {
      const above = anchor.top - GAP - h;
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - MARGIN - h);
    }
    panel.style.top = `${top}px`;
  }, [panelRef, anchor]);
}
