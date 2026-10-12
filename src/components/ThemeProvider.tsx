"use client";

import { FretNotes, LIGHT_BACKGROUND_COLORS, PatternSvg, scaledBackgroundColors } from "@/lib/backgroundPatterns";
import { useTheme } from "@/lib/useTheme";

/**
 * Ob nalaganju uveljavi shranjeno izbiro teme (svetla / temna / sistemska)
 * in se odziva na spremembe sistemske nastavitve. Izriše še ozadje aplikacije
 * (fiksna plast za vso vsebino) v obeh temah: blag vijoličen sij v zgornjem
 * desnem in zelen v spodnjem levem kotu ter izbrani vzorec (svetla tema: temne
 * črte LIGHT_BACKGROUND_COLORS, temna: svetle; "zaigrane note" samo v temni).
 */
export default function ThemeProvider() {
  const { pattern, patternOpacity } = useTheme();
  return (
    <>
    {/* Svetla tema: zelo blag vijoličen in zelen sij ter vzorec s temnimi črtami. */}
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(48rem 34rem at 100% 0%, rgba(139,92,246,0.07), transparent 65%), radial-gradient(44rem 32rem at 0% 100%, rgba(16,185,129,0.06), transparent 65%)",
        }}
      />
      {pattern && <PatternSvg id={pattern} colors={scaledBackgroundColors(patternOpacity, LIGHT_BACKGROUND_COLORS)} className={`relative h-full w-full ${pattern === "fretboard" ? "max-lg:opacity-60" : ""}`} />}
    </div>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden dark:block">
      {/* Telefon: blažji sij (manjši zaslon, isti krogi pokrijejo več). */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          backgroundImage:
            "radial-gradient(32rem 24rem at 100% 0%, rgba(139,92,246,0.08), transparent 65%), radial-gradient(30rem 22rem at 0% 100%, rgba(16,185,129,0.06), transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          backgroundImage:
            "radial-gradient(55rem 38rem at 100% 0%, rgba(139,92,246,0.13), transparent 65%), radial-gradient(50rem 36rem at 0% 100%, rgba(16,185,129,0.10), transparent 65%)",
        }}
      />
      {/* Telefon: vrat kitare malo manj viden (opacity 60 %). */}
      {pattern && <PatternSvg id={pattern} colors={scaledBackgroundColors(patternOpacity)} className={`relative h-full w-full ${pattern === "fretboard" ? "max-lg:opacity-60" : ""}`} />}
      {/* Vrat kitare: občasno blago zasveti "zaigrana nota" na naključnem polju. */}
      {pattern === "fretboard" && patternOpacity > 0 && (
        <div className="absolute inset-0" style={{ opacity: Math.min(1, patternOpacity) }}>
          <FretNotes className="absolute inset-0 h-full w-full max-lg:opacity-60" />
        </div>
      )}
    </div>
    </>
  );
}
