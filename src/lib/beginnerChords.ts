// Vsebina sekcije "Za začetnike" (Beginners.tsx): lekcije začetnih akordov po
// vrsti, brenkalni vzorci in vrste akordov za pregled "Vsi akordi".
import type { ChordPosition } from "@/lib/chordShapes";

export type LessonChord = {
  name: string;
  // Absolutni pragovi od E do e (-1 = ne igraš, 0 = prazna) in prsti (1 = kazalec … 4 = mezinec).
  frets: number[];
  fingers: number[];
  barre?: number;
  tip: string;
  mistake: string;
};
export type Lesson = { title: string; intro: string; chords: LessonChord[] };

export function lessonShape(c: LessonChord): ChordPosition {
  return { frets: c.frets, fingers: c.fingers, barres: c.barre ? [c.barre] : [], baseFret: 1 };
}

export const LESSONS: Lesson[] = [
  {
    title: "Prva akorda",
    intro: "Em in Am sta najlažja: Em potrebuje samo dva prsta, Am pa je ista oblika, premaknjena za eno struno niže, z dodanim kazalcem.",
    chords: [
      {
        name: "Em",
        frets: [0, 2, 2, 0, 0, 0],
        fingers: [0, 2, 3, 0, 0, 0],
        tip: "Sredinec na 2. prag strune A, prstanec na 2. prag strune D. Brenkaš vseh šest strun.",
        mistake: "Prsta ležita na sosednjih strunah — pritisni s konicami, da se strune G, H in e prosto oglasijo.",
      },
      {
        name: "Am",
        frets: [-1, 0, 2, 2, 1, 0],
        fingers: [0, 0, 2, 3, 1, 0],
        tip: "Kazalec na 1. prag strune H, sredinec in prstanec na 2. prag strun D in G. Debele E ne brenkaj.",
        mistake: "Kazalec utiša prazno e struno — prst naj stoji pokonci, ne položen.",
      },
    ],
  },
  {
    title: "Durovi akordi E, A, D",
    intro: "E je Am, premaknjen za struno navzgor. A in D sta ključna za nešteto pesmi v D in A.",
    chords: [
      {
        name: "E",
        frets: [0, 2, 2, 1, 0, 0],
        fingers: [0, 2, 3, 1, 0, 0],
        tip: "Oblika Am, premaknjena za eno struno proti debeli E. Brenkaš vseh šest strun.",
        mistake: "Kazalec na G struni se dotika H strune — zakrivi ga bolj.",
      },
      {
        name: "A",
        frets: [-1, 0, 2, 2, 2, 0],
        fingers: [0, 0, 1, 2, 3, 0],
        tip: "Trije prsti v vrsti na 2. pragu strun D, G in H. Brenkaš od strune A navzdol.",
        mistake: "Za tri prste je malo prostora — prsti so lahko rahlo zamaknjeni, kazalec bolj za pragom.",
      },
      {
        name: "D",
        frets: [-1, -1, 0, 2, 3, 2],
        fingers: [0, 0, 0, 1, 3, 2],
        tip: "Trikotnik na tankih strunah: kazalec G/2, prstanec H/3, sredinec e/2. Brenkaš samo štiri strune od D.",
        mistake: "Brenkanje debelih strun E in A — začni pri struni D.",
      },
    ],
  },
  {
    title: "C in G",
    intro: "C in G skupaj z Am in Em ter D sestavljajo največ pesmi. Sta raztegnjena čez več pragov, zato potrebujeta več vaje.",
    chords: [
      {
        name: "C",
        frets: [-1, 3, 2, 0, 1, 0],
        fingers: [0, 3, 2, 0, 1, 0],
        tip: "Prstanec A/3, sredinec D/2, kazalec H/1 — stopnice navzdol. Debele E ne brenkaj.",
        mistake: "Sredinec utiša prazno G struno — zapestje spusti, da so prsti bolj pokonci.",
      },
      {
        name: "G",
        frets: [3, 2, 0, 0, 0, 3],
        fingers: [2, 1, 0, 0, 0, 3],
        tip: "Sredinec E/3, kazalec A/2, prstanec e/3. Brenkaš vseh šest strun.",
        mistake: "Dlan se dotika tankih strun — palec naj bo za vratom, ne čez rob.",
      },
    ],
  },
  {
    title: "Dm in septakordi",
    intro: "Dm je mol od D. A7, E7 in D7 so lažji od svojih durovih bratov in zvenijo bolj bluesovsko.",
    chords: [
      {
        name: "Dm",
        frets: [-1, -1, 0, 2, 3, 1],
        fingers: [0, 0, 0, 2, 3, 1],
        tip: "Kot D, le na e struni kazalec na 1. prag. Brenkaš štiri strune od D.",
        mistake: "Kazalec na e se zdrsne na H — postavi ga tik za prag.",
      },
      {
        name: "A7",
        frets: [-1, 0, 2, 0, 2, 0],
        fingers: [0, 0, 2, 0, 3, 0],
        tip: "Kot A, a brez prsta na G struni: sredinec D/2, prstanec H/2.",
        mistake: "G struna mora zveneti prazna.",
      },
      {
        name: "E7",
        frets: [0, 2, 0, 1, 0, 0],
        fingers: [0, 2, 0, 1, 0, 0],
        tip: "Kot E, brez prstanca: sredinec A/2, kazalec G/1.",
        mistake: "Sredinec se dotika prazne D strune.",
      },
      {
        name: "D7",
        frets: [-1, -1, 0, 2, 1, 2],
        fingers: [0, 0, 0, 2, 1, 3],
        tip: "Obrnjen trikotnik: sredinec G/2, kazalec H/1, prstanec e/2.",
        mistake: "Brenkanje strun E in A.",
      },
    ],
  },
  {
    title: "Mali F",
    intro: "Pravi F je barre — pred njim se nauči manjšo obliko na štirih strunah, ki zveni skoraj enako.",
    chords: [
      {
        name: "Fmaj7",
        frets: [-1, -1, 3, 2, 1, 0],
        fingers: [0, 0, 3, 2, 1, 0],
        tip: "Stopnice: prstanec D/3, sredinec G/2, kazalec H/1, e prazna. Lep, mehak nadomestek za F.",
        mistake: "Prazna e struna utišana s kazalcem.",
      },
      {
        name: "F",
        frets: [-1, -1, 3, 2, 1, 1],
        fingers: [0, 0, 3, 2, 1, 1],
        barre: 1,
        tip: "Kot Fmaj7, le kazalec pritisne hkrati H in e na 1. pragu (mali barre). Brenkaš štiri strune.",
        mistake: "H struna brni — kazalec rahlo zavrti na rob (stran proti glavi kitare).",
      },
    ],
  },
  {
    title: "Barre akordi",
    intro: "Barre: kazalec pritisne vse strune na enem pragu, ostali prsti tvorijo obliko E ali Am. Z isto obliko igraš vsak akord — samo premakneš jo.",
    chords: [
      {
        name: "F",
        frets: [1, 3, 3, 2, 1, 1],
        fingers: [1, 3, 4, 2, 1, 1],
        barre: 1,
        tip: "Oblika E, premaknjena na 1. prag, kazalec čez vse strune. Na 3. pragu je to G, na 5. A.",
        mistake: "Pritiskaš s ploskvijo prsta — uporabi stranski, kostni rob kazalca in vleci z roko nazaj, ne stiskaj s palcem.",
      },
      {
        name: "Bm",
        frets: [-1, 2, 4, 4, 3, 2],
        fingers: [0, 1, 3, 4, 2, 1],
        barre: 2,
        tip: "Oblika Am, premaknjena na 2. prag, kazalec čez strune A do e. Debele E ne brenkaj.",
        mistake: "Za začetek je dovolj, da zvenijo štiri tanke strune — Bm brez basa (x x 4 4 3 2).",
      },
    ],
  },
];

export const LESSON_CHORD_NAMES = Array.from(new Set(LESSONS.flatMap((l) => l.chords.map((c) => c.name))));
// Prvi prijem s tem imenom (za "F" mali F, ne barre — začetniku prijaznejši).
export function lessonChord(name: string): LessonChord | undefined {
  return LESSONS.flatMap((l) => l.chords).find((c) => c.name === name);
}

// Brenkalni vzorci: 8 osmink v taktu 4/4 ("D" = navzdol, "U" = navzgor, null = brez udarca).
export type Stroke = "D" | "U" | null;
export const STRUM_PATTERNS: { name: string; hint: string; steps: Stroke[] }[] = [
  {
    name: "Standard",
    hint: "Dol, dol-gor, gor-dol-gor (D · D U · U D U) — najpogostejši vzorec. Pri praznem mestu roka še vedno zamahne, le strun ne zadene.",
    steps: ["D", null, "D", "U", null, "U", "D", "U"],
  },
  { name: "Samo navzdol", hint: "Štiri udarce navzdol na vsako dobo. Začni tu — roka naj se giblje enakomerno.", steps: ["D", null, "D", null, "D", null, "D", null] },
  { name: "Navzdol–navzgor", hint: "Osminke: navzdol na dobo, navzgor vmes. Roka niha kot nihalo ves čas.", steps: ["D", "U", "D", "U", "D", "U", "D", "U"] },
  { name: "Country / galop", hint: "D · D U D · D U — poskočen ritem za country in folk.", steps: ["D", null, "D", "U", "D", null, "D", "U"] },
  { name: "Off-beat (reggae)", hint: "Samo navzgor med dobami — kratko in odrezano, takoj utišaj z levo roko.", steps: [null, "U", null, "U", null, "U", null, "U"] },
];

// "Vsi akordi": vrste akordov (pripona → slovenski opis).
export const CHORD_TYPES: { suffix: string; label: string }[] = [
  { suffix: "", label: "dur" },
  { suffix: "m", label: "mol" },
  { suffix: "7", label: "7" },
  { suffix: "m7", label: "m7" },
  { suffix: "maj7", label: "maj7" },
  { suffix: "6", label: "6" },
  { suffix: "m6", label: "m6" },
  { suffix: "9", label: "9" },
  { suffix: "add9", label: "add9" },
  { suffix: "sus2", label: "sus2" },
  { suffix: "sus4", label: "sus4" },
  { suffix: "7sus4", label: "7sus4" },
  { suffix: "5", label: "power (5)" },
  { suffix: "dim", label: "dim" },
  { suffix: "dim7", label: "dim7" },
  { suffix: "aug", label: "aug" },
];
export const CHORD_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
