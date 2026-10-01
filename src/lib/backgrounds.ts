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
];
// Od svetlega do temnega (sive: Grafit, Svinčena, Temno siva, Oglje,
// Antracit, Črna), rjava na koncu.
export const BACKGROUND_ORDER = [0, 1, 4, 10, 2, 11, 5, 3, 6, 7, 8, 9];
