"use client";

import { FretNotes, LIGHT_BACKGROUND_COLORS, PatternSvg, scaledBackgroundColors } from "@/lib/backgroundPatterns";
import { useTheme } from "@/lib/useTheme";
import AmbientParticles from "@/components/AmbientParticles";
import { BACKGROUNDS } from "@/lib/backgrounds";

/**
 * Ob nalaganju uveljavi shranjeno izbiro teme (svetla / temna / sistemska)
 * in se odziva na spremembe sistemske nastavitve. Izriše še ozadje aplikacije
 * (fiksna plast za vso vsebino) v obeh temah: blag vijoličen sij v zgornjem
 * desnem in zelen v spodnjem levem kotu ter izbrani vzorec (svetla tema: temne
 * črte LIGHT_BACKGROUND_COLORS, temna: svetle; "zaigrane note" samo v temni).
 */
export default function ThemeProvider() {
  const { pattern, patternOpacity, appBg, particles, brightness } = useTheme();
  // Svetlost ozadja: črna (temneje) ali bela (svetleje) tančica čez celo ozadje,
  // pod vsebino. Pri bari ±50 % je tančica 50 % (temneje) oziroma 35 % (svetleje).
  const veil =
    brightness === 0 ? null : (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: brightness < 0 ? `rgba(0,0,0,${-brightness})` : `rgba(255,255,255,${brightness * 0.7})` }}
      />
    );
  // Ozadje s prelivom (Morska megla, Jutranji grafit, Polnočno modra): preliv in
  // vinjeta namesto vijoličnega/zelenega sija, po želji živi delci.
  const rich = appBg !== null ? BACKGROUNDS[appBg] : undefined;
  const gradient = rich && "gradient" in rich ? rich.gradient : undefined;
  const particleKind = rich && "particles" in rich ? rich.particles : undefined;
  const blobs = rich && "blobs" in rich ? rich.blobs : undefined;
  const vignette = rich && "vignette" in rich ? rich.vignette : 0.35;
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
      {veil}
    </div>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden dark:block">
      {gradient ? (
        <>
          <div className="absolute inset-0" style={{ backgroundImage: gradient }} />
          {blobs && (
            // Zamegljene, umirjene barvne lise, ki se počasi premikajo (ustavi jih stikalo).
            <div className="absolute inset-0 opacity-55 blur-[64px] saturate-[0.55]">
              {blobs.map(([color, left, top, size], i) => (
                <span
                  key={i}
                  className={`bg-blob bg-blob-${i} absolute aspect-square rounded-full ${particles ? "" : "[animation-play-state:paused]"}`}
                  style={{ background: color, left: `${left}%`, top: `${top}%`, width: `${size}%` }}
                />
              ))}
            </div>
          )}
          <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(115% 100% at 50% 45%, transparent ${blobs ? 42 : 55}%, rgba(0,0,0,${vignette}) 100%)` }} />
          {particles && particleKind && <AmbientParticles kind={particleKind} className="absolute inset-0 h-full w-full" />}
        </>
      ) : (
      <>
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
      </>
      )}
      {/* Telefon: vrat kitare malo manj viden (opacity 60 %). */}
      {pattern && <PatternSvg id={pattern} colors={scaledBackgroundColors(patternOpacity)} className={`relative h-full w-full ${pattern === "fretboard" ? "max-lg:opacity-60" : ""}`} />}
      {/* Vrat kitare: občasno blago zasveti "zaigrana nota" na naključnem polju. */}
      {pattern === "fretboard" && patternOpacity > 0 && (
        <div className="absolute inset-0" style={{ opacity: Math.min(1, patternOpacity) }}>
          <FretNotes className="absolute inset-0 h-full w-full max-lg:opacity-60" />
        </div>
      )}
      {veil}
    </div>
    </>
  );
}
