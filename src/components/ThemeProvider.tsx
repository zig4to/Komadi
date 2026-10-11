"use client";

import { BACKGROUND_COLORS, PatternSvg } from "@/lib/backgroundPatterns";
import { useTheme } from "@/lib/useTheme";

/**
 * Ob nalaganju uveljavi shranjeno izbiro teme (svetla / temna / sistemska)
 * in se odziva na spremembe sistemske nastavitve. Izriše še izbrani vzorec
 * ozadja (fiksna plast za vso vsebino, samo v temni temi).
 */
export default function ThemeProvider() {
  const { pattern } = useTheme();
  if (!pattern) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden dark:block">
      <PatternSvg id={pattern} colors={BACKGROUND_COLORS} className="h-full w-full" />
    </div>
  );
}
