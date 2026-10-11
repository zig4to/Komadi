"use client";

import { BACKGROUND_COLORS, FretboardPulses, PatternSvg } from "@/lib/backgroundPatterns";
import { useTheme } from "@/lib/useTheme";

/**
 * Ob nalaganju uveljavi shranjeno izbiro teme (svetla / temna / sistemska)
 * in se odziva na spremembe sistemske nastavitve. Izriše še ozadje aplikacije
 * v temni temi (fiksna plast za vso vsebino): blag vijoličen sij v zgornjem
 * desnem in zelen v spodnjem levem kotu ter izbrani vzorec.
 */
export default function ThemeProvider() {
  const { pattern } = useTheme();
  return (
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
      {pattern && <PatternSvg id={pattern} colors={BACKGROUND_COLORS} className="relative h-full w-full" />}
      {/* Računalnik: barvni pulzi po strunah (telefon miruje — baterija). */}
      {pattern === "fretboard" && <FretboardPulses className="absolute inset-0 hidden h-full w-full lg:block" />}
    </div>
  );
}
