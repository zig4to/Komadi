// "Pišem" (SongWriter.tsx): lastne skladbe benda (tabela own_songs,
// 0045_own_songs.sql) — deli pesmi z vrsticami besedila in akordi nad besedami,
// pomočnik za akorde (stopnje tonalitete, znane progresije), predloge zgradbe
// in pretvorba v UG zapis (chords_text), ki ga zna brati pregledovalnik akordov.

import { NAMES, mod12 } from "@/lib/scales";

export type SectionType = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "solo" | "outro";
// at = indeks znaka v besedilu vrstice, nad katerim stoji akord. Vrstica brez
// besedila je instrumentalna: akordi po vrsti (at = zaporedna številka).
export type OwnChord = { at: number; name: string };
// instr = vrstica samih akordov (uvod, solo, rep za refrenom) — v urejanju besedila
// je ni, vedno stoji za vrsticami z besedilom.
export type OwnLine = { id: string; text: string; chords: OwnChord[]; instr?: true };
export type OwnSection = { id: string; type: SectionType; lines: OwnLine[] };
export type OwnSong = {
  id: string;
  title: string;
  idea: string;
  mood: string | null;
  key_tonic: number;
  key_minor: boolean;
  bpm: number;
  sections: OwnSection[];
  created_by: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  library_song_id: string | null;
  created_at: string;
  updated_at: string;
};
export type OwnMemo = {
  id: string;
  own_song_id: string;
  path: string;
  duration: number | null;
  label: string | null;
  created_by_name: string | null;
  created_at: string;
};

export const SECTION_TYPES: { type: SectionType; sl: string; ug: string; instrumental?: true; numbered: boolean }[] = [
  { type: "intro", sl: "Uvod", ug: "Intro", instrumental: true, numbered: false },
  { type: "verse", sl: "Kitica", ug: "Verse", numbered: true },
  { type: "prechorus", sl: "Predrefren", ug: "Pre-Chorus", numbered: true },
  { type: "chorus", sl: "Refren", ug: "Chorus", numbered: true },
  { type: "bridge", sl: "Most", ug: "Bridge", numbered: false },
  { type: "solo", sl: "Solo", ug: "Solo", instrumental: true, numbered: true },
  { type: "outro", sl: "Zaključek", ug: "Outro", instrumental: true, numbered: false },
];
export const sectionInfo = (t: SectionType) => SECTION_TYPES.find((s) => s.type === t) ?? SECTION_TYPES[1];

// Oznake delov po vrsti: "Kitica 1", "Refren 2" … Številko dobijo samo deli, ki
// se ponovijo (kot pri skillu spedenaj): enkraten Most ostane "Most".
export function sectionLabels(sections: OwnSection[]): { sl: string; ug: string }[] {
  const total = new Map<SectionType, number>();
  for (const s of sections) total.set(s.type, (total.get(s.type) ?? 0) + 1);
  const seen = new Map<SectionType, number>();
  return sections.map((s) => {
    const info = sectionInfo(s.type);
    const n = (seen.get(s.type) ?? 0) + 1;
    seen.set(s.type, n);
    const num = (total.get(s.type) ?? 0) > 1 ? ` ${n}` : "";
    return { sl: info.sl + num, ug: info.ug + num };
  });
}

export const newId = () => Math.random().toString(36).slice(2, 10);
export const emptyLine = (): OwnLine => ({ id: newId(), text: "", chords: [] });
export const instrLine = (): OwnLine => ({ id: newId(), text: "", chords: [], instr: true });
export const newSection = (type: SectionType): OwnSection => ({
  id: newId(),
  type,
  lines: sectionInfo(type).instrumental ? [instrLine()] : [emptyLine(), emptyLine(), emptyLine(), emptyLine()],
});
// Kopija dela (npr. refren še enkrat): nove id-je, isto besedilo in akordi.
export const copySection = (s: OwnSection): OwnSection => ({
  id: newId(),
  type: s.type,
  lines: s.lines.map((l) => ({ ...l, id: newId(), chords: l.chords.map((c) => ({ ...c })) })),
});

export const keyLabel = (tonic: number, minor: boolean) => `${NAMES[mod12(tonic)]} ${minor ? "mol" : "dur"}`;

// ---------- Akordi tonalitete ----------

type Step = { semi: number; q: "" | "m" | "dim" | "7" };
const chordName = (tonic: number, s: Step) => NAMES[mod12(tonic + s.semi)] + s.q;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const MAJOR: Step[] = [
  { semi: 0, q: "" },
  { semi: 2, q: "m" },
  { semi: 4, q: "m" },
  { semi: 5, q: "" },
  { semi: 7, q: "" },
  { semi: 9, q: "m" },
  { semi: 11, q: "dim" },
];
const MINOR: Step[] = [
  { semi: 0, q: "m" },
  { semi: 2, q: "dim" },
  { semi: 3, q: "" },
  { semi: 5, q: "m" },
  { semi: 7, q: "m" },
  { semi: 8, q: "" },
  { semi: 10, q: "" },
];

const romanOf = (i: number, q: Step["q"]) => {
  const r = q === "m" || q === "dim" ? ROMAN[i].toLowerCase() : ROMAN[i];
  return q === "dim" ? r + "°" : r;
};

// Akordi stopenj tonalitete (I–vii° v duru, i–VII v molu); v molu še durovi
// V in V7 (harmonični mol — zveni bolj "domov" pred i).
export function diatonicChords(tonic: number, minor: boolean): { roman: string; name: string; extra?: true }[] {
  const steps = minor ? MINOR : MAJOR;
  const out: { roman: string; name: string; extra?: true }[] = steps.map((s, i) => ({ roman: romanOf(i, s.q), name: chordName(tonic, s) }));
  if (minor) out.push({ roman: "V", name: chordName(tonic, { semi: 7, q: "" }), extra: true });
  else out.push({ roman: "V7", name: chordName(tonic, { semi: 7, q: "7" }), extra: true });
  return out;
}

// Znane progresije (stopnje glede na tonaliteto). minor = za molove tonalitete.
export type Progression = { id: string; label: string; hint: string; minor: boolean; steps: Step[] };
const st = (semi: number, q: Step["q"] = ""): Step => ({ semi, q });
export const PROGRESSIONS: Progression[] = [
  { id: "pop", label: "I – V – vi – IV", hint: "najpogostejša pop progresija, deluje za kitico in refren", minor: false, steps: [st(0), st(7), st(9, "m"), st(5)] },
  { id: "pop2", label: "vi – IV – I – V", hint: "ista kot zgoraj, začne na molu — bolj čustveno", minor: false, steps: [st(9, "m"), st(5), st(0), st(7)] },
  { id: "fifties", label: "I – vi – IV – V", hint: "»petdeseta«, balade in stari rock'n'roll", minor: false, steps: [st(0), st(9, "m"), st(5), st(7)] },
  { id: "rock", label: "I – IV – V – IV", hint: "rock in country, enostavno in poskočno", minor: false, steps: [st(0), st(5), st(7), st(5)] },
  { id: "folk", label: "I – IV – I – V", hint: "kantavtorska, za pripovedne kitice", minor: false, steps: [st(0), st(5), st(0), st(7)] },
  { id: "jazz", label: "ii – V – I", hint: "jazz in mehak prehod nazaj na tonika", minor: false, steps: [st(2, "m"), st(7), st(0)] },
  {
    id: "blues",
    label: "12-taktni blues",
    hint: "I I I I · IV IV I I · V IV I V — en akord na takt",
    minor: false,
    steps: [st(0), st(0), st(0), st(0), st(5), st(5), st(0), st(0), st(7), st(5), st(0), st(7)],
  },
  { id: "aeolian", label: "i – VII – VI – VII", hint: "molovski rock, zlasti za refren", minor: true, steps: [st(0, "m"), st(10), st(8), st(10)] },
  { id: "minorpop", label: "i – VI – III – VII", hint: "molovski pop (zrcalo vi–IV–I–V)", minor: true, steps: [st(0, "m"), st(8), st(3), st(10)] },
  { id: "minorcad", label: "i – iv – V – i", hint: "klasična molova kadenca, V z durovo terco", minor: true, steps: [st(0, "m"), st(5, "m"), st(7), st(0, "m")] },
  { id: "andalusian", label: "i – VII – VI – V", hint: "»andaluzijska« kadenca, flamenko in balade", minor: true, steps: [st(0, "m"), st(10), st(8), st(7)] },
];
export const progressionChords = (tonic: number, p: Progression) => p.steps.map((s) => chordName(tonic, s));

// ---------- Predloge zgradbe ----------

export const STRUCTURES: { id: string; label: string; hint: string; types: SectionType[] }[] = [
  { id: "pop", label: "Pop", hint: "Uvod · K · R · K · R · Most · R · Zaključek", types: ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"] },
  { id: "simple", label: "Kitica – refren", hint: "K · R · K · R · R", types: ["verse", "chorus", "verse", "chorus", "chorus"] },
  {
    id: "pre",
    label: "S predrefrenom",
    hint: "Uvod · K · PR · R · K · PR · R · Solo · R",
    types: ["intro", "verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "solo", "chorus"],
  },
  { id: "ballad", label: "Balada", hint: "Uvod · K · K · R · K · R · Zaključek", types: ["intro", "verse", "verse", "chorus", "verse", "chorus", "outro"] },
  { id: "story", label: "Pripovedna", hint: "samo kitice (kantavtorska) · K · K · K · K", types: ["verse", "verse", "verse", "verse"] },
];

// Zgradba iz predloge: ponovljeni refreni (in predrefreni) dobijo vsebino prvega,
// ko je ta že napisan — tu so vsi prazni, kopira se v urejevalniku ("Ponovi").
export const sectionsFromStructure = (types: SectionType[]) => types.map(newSection);

export const sectionHasContent = (s: OwnSection) => s.lines.some((l) => l.text.trim() || l.chords.length);

// ---------- Nasveti vodiča ----------

export const STEPS = [
  { id: "idea", label: "Ideja" },
  { id: "key", label: "Tonaliteta" },
  { id: "structure", label: "Zgradba" },
  { id: "write", label: "Akordi in besedilo" },
  { id: "memos", label: "Posnetki" },
  { id: "preview", label: "Pregled" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export const TIPS: Record<StepId, string[]> = {
  idea: [
    "Začni z enim stavkom: o čem je pesem? Konkretna zgodba (kdo, kje, kdaj) je skoraj vedno boljša od splošnega občutka.",
    "Naslov je pogosto vrstica refrena — kratka, zapomnljiva, ponovljena.",
    "Pokaži, ne razlagaj: namesto »bil sem žalosten« opiši, kaj si videl in naredil.",
  ],
  key: [
    "Izberi tonaliteto, ki ti je udobna za petje: zapoj refren in preveri najvišji ton.",
    "Dur zveni bolj veselo in odprto, mol bolj resno in otožno.",
    "Tempo: balada 60–80 BPM, srednji pop 90–110, poskočno 120+.",
    "Za kitaro so prijazne G, C, D, E, A dur ter Am, Em, Dm — veliko odprtih akordov.",
  ],
  structure: [
    "Najpogostejša zgradba: kitica – refren – kitica – refren – most – refren.",
    "Kitica pripoveduje (vsakič novo besedilo), refren ponavlja glavno misel (enako besedilo).",
    "Most je kontrast: drugi akordi ali drug pogled, da je zadnji refren spet svež.",
    "Do refrena naj ne bo več kot ~1 minuta.",
  ],
  write: [
    "Refren pogosto začne na drugem akordu kot kitica (npr. kitica na I, refren na IV ali vi) — tako se sliši, da je prišel.",
    "Akord postavi na poudarjen zlog — tja, kjer bi ob petju udaril z nogo.",
    "Rime: ni treba vsake vrstice — dovolj je, da se rimata 2. in 4.",
    "Isto število zlogov v istoležnih vrsticah kitic → melodija se ponovi brez prilagajanja.",
    "Ko imaš refren, ga ponovi z gumbom »Ponovi« namesto pisanja na novo.",
  ],
  memos: [
    "Melodijo posnemi takoj, ko se domisliš — čez pol ure je ne boš več vedel natančno.",
    "Zadostuje mrmranje na »la la«; besedilo pride pozneje.",
    "Posnemi tudi ritem kitare (brenkanje), če ga imaš v glavi.",
  ],
  preview: [
    "Preberi besedilo na glas: kar se težko izgovori, se tudi težko poje.",
    "Ko je skladba gotova, jo »Prestavi v knjižnico« — tam jo lahko igrate v Akordih v aplikaciji, Sam Špili in Jamu.",
  ],
};

// ---------- UG zapis ----------

// Vrstica akordov po stolpcih (at); akord, ki bi prekril prejšnjega, se zamakne
// desno. Stolpci štejejo brez [ch] oznak. Instrumentalna vrstica: akordi na vsake 4 znake.
function chordLine(chords: OwnChord[], instrumental: boolean): string {
  const sorted = [...chords].sort((a, b) => a.at - b.at);
  const placed: { col: number; name: string }[] = [];
  let end = 0;
  sorted.forEach((c, i) => {
    const want = instrumental ? i * 4 : c.at;
    const col = placed.length ? Math.max(want, end + 1) : Math.max(0, want);
    placed.push({ col, name: c.name });
    end = col + c.name.length;
  });
  let out = "";
  let pos = 0;
  for (const p of placed) {
    out += " ".repeat(Math.max(0, p.col - pos)) + `[ch]${p.name}[/ch]`;
    pos = p.col + p.name.length;
  }
  return out;
}

export function toUgText(song: Pick<OwnSong, "sections" | "key_tonic" | "key_minor" | "bpm">): string {
  const labels = sectionLabels(song.sections);
  const out: string[] = [`Tonaliteta: ${keyLabel(song.key_tonic, song.key_minor)}, ${song.bpm} BPM`, ""];
  song.sections.forEach((s, i) => {
    if (!sectionHasContent(s)) return;
    out.push(`[${labels[i].ug}]`);
    for (const l of s.lines) {
      const text = l.text.replace(/\s+$/, "");
      if (!text && !l.chords.length) continue;
      if (l.chords.length) out.push(chordLine(l.chords, !text));
      if (text) out.push(text);
    }
    out.push("");
  });
  return out.join("\n").replace(/\n+$/, "\n");
}

// Vsi akordi skladbe po vrsti pojavitve (za paleto "uporabljeni").
export function usedChords(sections: OwnSection[]): string[] {
  const seen: string[] = [];
  for (const s of sections)
    for (const l of s.lines)
      for (const c of [...l.chords].sort((a, b) => a.at - b.at)) if (!seen.includes(c.name)) seen.push(c.name);
  return seen;
}

// Besede vrstice z začetnim indeksom (za postavljanje akordov s tapom).
export function wordsOf(text: string): { word: string; start: number }[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], start: m.index ?? 0 }));
}

// Časovnica dela za predvajanje: vsaka vrstica z besedilom = en takt (4 dobe),
// akordi razporejeni po položaju v vrstici; instrumentalna vrstica = en takt na
// akord. Vrne dogodke na pol-dobah (beat2 = 2 × doba) in skupno dolžino.
export function sectionTimeline(lines: OwnLine[]): { events: { half: number; name: string; line: number }[]; halves: number } {
  const events: { half: number; name: string; line: number }[] = [];
  let bar = 0;
  lines.forEach((l, li) => {
    const chords = [...l.chords].sort((a, b) => a.at - b.at);
    const text = l.text.trim();
    if (!text) {
      chords.forEach((c) => events.push({ half: bar++ * 8, name: c.name, line: li }));
      return;
    }
    const len = Math.max(1, l.text.length);
    let last = -1;
    for (const c of chords) {
      let beat = Math.min(3, Math.round((c.at / len) * 4));
      if (beat <= last) beat = last + 1;
      if (beat > 3) break;
      events.push({ half: bar * 8 + beat * 2, name: c.name, line: li });
      last = beat;
    }
    bar++;
  });
  return { events, halves: bar * 8 };
}
