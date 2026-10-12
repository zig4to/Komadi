import type { PatternId } from "@/lib/backgroundPatterns";
import type { ParticleKind } from "@/components/AmbientParticles";

// Barvna lisa ozadja (temna serija): [barva, left %, top %, širina % zaslona];
// ThemeProvider jih zamegli in počasi premika (.bg-blob v globals.css).
export type Blob = [string, number, number, number];

// Ozadja vsebine pregledovalnika akordov (⚙ → Tema → Barva ozadja, tudi v
// "Sam Špili") in ozadja aplikacije (⋮ → Nastavitve → Tema). Zgornji vrstici
// pregledovalnika ostaneta temni.
export const BACKGROUNDS = [
  { label: "Bela", light: true, bg: "#ffffff", text: "#171717", title: "#0a0a0a", muted: "#737373", panel: "#f5f5f5", border: "#d4d4d4" },
  { label: "Siva", light: true, bg: "#e5e5e5", text: "#171717", title: "#0a0a0a", muted: "#525252", panel: "#d4d4d4", border: "#a3a3a3" },
  { label: "Temno siva", light: false, bg: "#262626", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#171717", border: "#525252" },
  { label: "Črna", light: false, bg: "#0a0a0a", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#171717", border: "#525252" },
  // Nova ozadja so dodana na konec (izbira je v localStorage shranjena kot
  // indeks); vrstni red v izbirniku določa BACKGROUND_ORDER.
  { label: "Grafit", light: false, bg: "#3a3a3a", text: "#f5f5f5", title: "#ffffff", muted: "#b4b4b4", panel: "#262626", border: "#5e5e5e" },
  { label: "Antracit", light: false, bg: "#181818", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#0f0f0f", border: "#4a4a4a" },
  { label: "Rjava", light: false, bg: "#2a2019", text: "#f5ede6", title: "#ffffff", muted: "#b8a897", panel: "#1e1711", border: "#5a4a3d" },
  { label: "Temno rjava", light: false, bg: "#18110c", text: "#f2e9e1", title: "#ffffff", muted: "#a89684", panel: "#0f0a07", border: "#4a3b30" },
  { label: "Temno modra", light: false, bg: "#0b1422", text: "#eef3fa", title: "#ffffff", muted: "#94a3b8", panel: "#070d18", border: "#334155" },
  { label: "Temno zelena", light: false, bg: "#0a1711", text: "#eef7f1", title: "#ffffff", muted: "#94ab9f", panel: "#06100b", border: "#2f4a3d" },
  { label: "Svinčena", light: false, bg: "#303030", text: "#f5f5f5", title: "#ffffff", muted: "#adadad", panel: "#1f1f1f", border: "#585858" },
  { label: "Oglje", light: false, bg: "#1f1f1f", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#121212", border: "#4d4d4d" },
  // Ozadja z vzorcem (enaki kot vzorci ozadja aplikacije): grafitna podlaga +
  // tanke črte. Samo za pregledovalnik akordov / Sam Špili — v izbiri ozadja
  // aplikacije jih ni (tam je vzorec ločena izbira, ⋮ → Nastavitve → Tema → Vzorec).
  { label: "Plastnice", light: false, bg: "#0a0a0b", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#141416", border: "#3a3a3f", pattern: "topo" as PatternId },
  { label: "Vrat kitare", light: false, bg: "#0a0a0b", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#141416", border: "#3a3a3f", pattern: "fretboard" as PatternId },
  { label: "Zvočnik", light: false, bg: "#0a0a0b", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#141416", border: "#3a3a3f", pattern: "speaker" as PatternId },
  { label: "Akordni diagram", light: false, bg: "#0a0a0b", text: "#f5f5f5", title: "#ffffff", muted: "#a3a3a3", panel: "#141416", border: "#3a3a3f", pattern: "chord" as PatternId },
  // Ozadja s prelivom (svetlejši odtenki v sredini/zgoraj) in živimi delci v
  // ozadju aplikacije (AmbientParticles, stikalo "Delci v ozadju"). bg = osnovna
  // (temnejša) barva telesa; gradient se nariše čez (ThemeProvider, pregledovalnik).
  { label: "Morska megla", light: false, bg: "#16201f", text: "#eef6f5", title: "#ffffff", muted: "#9fb3b1", panel: "#121a1c", border: "#3b4f53", gradient: "radial-gradient(70% 80% at 50% 40%, #3d5257 0%, #253337 45%, #121a1c 100%)", particles: "dust" as ParticleKind },
  { label: "Jutranji grafit", light: false, bg: "#232428", text: "#f5f5f5", title: "#ffffff", muted: "#b0b0b6", panel: "#18191c", border: "#55575d", gradient: "linear-gradient(125deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 28%, transparent 46%), linear-gradient(180deg, #45474d 0%, #2b2d31 48%, #18191c 100%)", particles: "bokeh" as ParticleKind },
  { label: "Polnočno modra", light: false, bg: "#141b2e", text: "#eef3fc", title: "#ffffff", muted: "#9eaccb", panel: "#0d1220", border: "#3a4a72", gradient: "radial-gradient(90% 90% at 30% 20%, #34436a 0%, #1f2943 45%, #0d1220 100%)", particles: "stars" as ParticleKind },
  // Temna serija (umirjene barve): preliv z manjšo svetlejšo sredino, tri
  // zamegljene barvne lise, ki se počasi premikajo, močnejša vinjeta in glasbeni
  // delci ob levem in desnem robu (AmbientParticles).
  { label: "Globina", light: false, bg: "#0d1320", text: "#edf2fa", title: "#ffffff", muted: "#97a3b8", panel: "#070b14", border: "#2b3a55", gradient: "radial-gradient(42% 46% at 50% 42%, #1b2638 0%, #111826 55%, #070b14 100%)", blobs: [["#174a5c",-8,-12,55],["#2a2550",62,52,58],["#0d2140",-10,60,50]] as Blob[], vignette: 0.55, particles: "notes" as ParticleKind },
  { label: "Gozdni potok", light: false, bg: "#0c1510", text: "#edf6f0", title: "#ffffff", muted: "#97ab9d", panel: "#060a07", border: "#2c4334", gradient: "radial-gradient(40% 44% at 52% 45%, #1a2a20 0%, #101a14 55%, #060a07 100%)", blobs: [["#0f4d38",-12,20,52],["#123f43",66,-10,54],["#233d19",60,62,46]] as Blob[], vignette: 0.55, particles: "ripples" as ParticleKind },
  { label: "Jeklo", light: false, bg: "#141518", text: "#f2f3f5", title: "#ffffff", muted: "#a7abb3", panel: "#0b0c0e", border: "#43474e", gradient: "radial-gradient(40% 44% at 50% 42%, #2a2d32 0%, #1a1c20 55%, #0b0c0e 100%)", blobs: [["#4a5361",64,-14,50],["#161d29",-14,40,58],["#353e4b",30,70,44]] as Blob[], vignette: 0.55, particles: "strings" as ParticleKind },
  { label: "Severni sij", light: false, bg: "#0b1217", text: "#ecf6f6", title: "#ffffff", muted: "#94aab0", panel: "#05090c", border: "#2a3f48", gradient: "radial-gradient(40% 44% at 50% 45%, #16242d 0%, #0e171d 55%, #05090c 100%)", blobs: [["#0d5c55",-16,-6,50],["#1b2f6b",64,4,52],["#08402f",40,70,46]] as Blob[], vignette: 0.55, particles: "waves" as ParticleKind },
  { label: "Dim", light: false, bg: "#141614", text: "#f0f2ef", title: "#ffffff", muted: "#a6aca5", panel: "#0a0b0a", border: "#3e443f", gradient: "radial-gradient(40% 44% at 50% 44%, #292d2a 0%, #191c1a 55%, #0a0b0a 100%)", blobs: [["#3a443a",-12,46,54],["#30373f",62,-8,50],["#42463d",58,64,42]] as Blob[], vignette: 0.55, particles: "chords" as ParticleKind },
  // Samo preliv (brez lis in delcev): Globoka noč v štirih barvah (predefinirane
  // teme pregledovalnika akordov / Sam Špili) in mirne različice temne serije
  // (lise so vtisnjene v preliv kot radialni sij).
  { label: "Globoka noč", light: false, bg: "#070c1a", text: "#e4ecf8", title: "#ffffff", muted: "#94a0bd", panel: "#03050b", border: "#25304d", gradient: "radial-gradient(50% 60% at 30% 25%, #0e1730 0%, #070c1a 55%, #03050b 100%)" },
  { label: "Globoka noč zelena", light: false, bg: "#06160f", text: "#e6f6ee", title: "#ffffff", muted: "#93ab9e", panel: "#020805", border: "#22402f", gradient: "radial-gradient(50% 60% at 30% 25%, #0c2a1d 0%, #06160f 55%, #020805 100%)" },
  { label: "Globoka noč vijolična", light: false, bg: "#0f0a20", text: "#f0ebfa", title: "#ffffff", muted: "#a69cbf", panel: "#05030b", border: "#352a52", gradient: "radial-gradient(50% 60% at 30% 25%, #1f1238 0%, #0f0a20 55%, #05030b 100%)" },
  { label: "Globoka noč oranžna", light: false, bg: "#180c05", text: "#faf0e6", title: "#ffffff", muted: "#b8a28f", panel: "#070402", border: "#4a2e1a", gradient: "radial-gradient(50% 60% at 30% 25%, #2e1708 0%, #180c05 55%, #070402 100%)" },
  { label: "Mirno jeklo", light: false, bg: "#1a1c20", text: "#f2f3f5", title: "#ffffff", muted: "#a7abb3", panel: "#0b0c0e", border: "#43474e", gradient: "radial-gradient(40% 50% at 85% 5%, rgba(74,83,97,0.45), transparent 70%), radial-gradient(45% 55% at 5% 60%, rgba(22,29,41,0.6), transparent 70%), radial-gradient(40% 44% at 50% 42%, #2a2d32 0%, #1a1c20 55%, #0b0c0e 100%)" },
  { label: "Mirni dim", light: false, bg: "#191c1a", text: "#f0f2ef", title: "#ffffff", muted: "#a6aca5", panel: "#0a0b0a", border: "#3e443f", gradient: "radial-gradient(45% 55% at 10% 70%, rgba(58,68,58,0.5), transparent 70%), radial-gradient(40% 50% at 85% 10%, rgba(48,55,63,0.45), transparent 70%), radial-gradient(40% 44% at 50% 44%, #292d2a 0%, #191c1a 55%, #0a0b0a 100%)" },
  { label: "Mirni gozd", light: false, bg: "#101a14", text: "#edf6f0", title: "#ffffff", muted: "#97ab9d", panel: "#060a07", border: "#2c4334", gradient: "radial-gradient(45% 55% at 8% 40%, rgba(15,77,56,0.45), transparent 70%), radial-gradient(45% 55% at 92% 10%, rgba(18,63,67,0.45), transparent 70%), radial-gradient(40% 44% at 52% 45%, #1a2a20 0%, #101a14 55%, #060a07 100%)" },
  { label: "Mirna globina", light: false, bg: "#111826", text: "#edf2fa", title: "#ffffff", muted: "#97a3b8", panel: "#070b14", border: "#2b3a55", gradient: "radial-gradient(45% 55% at 8% 5%, rgba(23,74,92,0.45), transparent 70%), radial-gradient(48% 58% at 92% 85%, rgba(42,37,80,0.5), transparent 70%), radial-gradient(42% 46% at 50% 42%, #1b2638 0%, #111826 55%, #070b14 100%)" },
];
// Od svetlega do temnega (sive: Grafit, Svinčena, Temno siva, Oglje,
// Antracit, Črna), rjava na koncu.
export const BACKGROUND_ORDER = [0, 1, 4, 10, 2, 11, 5, 3, 6, 7, 8, 9, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 12, 13, 14, 15];
