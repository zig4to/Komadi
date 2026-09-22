// Stabilna barva iz imena avtorja — isti avtor vedno dobi isto barvo, ne
// glede na to, katera skladba ali komponenta jo izrisuje (SongCard, razdelek
// "Avtorji", "Predstavljeno").
//
// Prejšnja različica je izbrala odtenek zvezno (hash % 360) pri fiksni
// nasičenosti/svetlosti — take zvezne barve niso nič bolj "med seboj
// razločne" kot naključne, dva avtorja lahko pristaneta le nekaj stopinj
// narazen na barvnem krogu in izpadeta skoraj enako. Zato zdaj barvo
// izberemo iz ročno sestavljene palete, zgrajene tako, da je razdalja med
// katerimakoli dvema vnosoma čim večja:
// - 12 "živih" barv na barvnem krogu, enakomerno razmaknjenih na vsakih 30°
//   (vključno z eno umirjeno rumeno/gorčično — rumena ostane, a je le en
//   vnos od mnogih, ne prevladujoč pas),
// - 9 "zemeljskih" barv (rjave, olivne, slive, bordo …) na vmesnih odtenkih,
//   a z bistveno nižjo nasičenostjo/svetlostjo, da se tudi ob podobnem
//   odtenku vizualno jasno ločijo od živih barv,
// - 2 čisti sivi (brez nasičenosti).
// Avtor dobi vnos po hashu svojega imena po modulu dolžine palete.
interface Swatch {
  h: number;
  s: number;
  l: number;
}

const PALETTE: Swatch[] = [
  // Žive barve — 12x, vsakih 30° po barvnem krogu.
  { h: 0, s: 72, l: 50 }, // rdeča
  { h: 30, s: 75, l: 48 }, // oranžna
  { h: 60, s: 60, l: 38 }, // gorčična/temno rumena
  { h: 90, s: 50, l: 36 }, // limeta
  { h: 120, s: 50, l: 36 }, // zelena
  { h: 150, s: 65, l: 40 }, // smaragdna
  { h: 180, s: 68, l: 38 }, // cian/teal
  { h: 210, s: 75, l: 55 }, // nebesno modra
  { h: 240, s: 65, l: 60 }, // modra
  { h: 270, s: 55, l: 60 }, // vijolična
  { h: 300, s: 50, l: 56 }, // magenta
  { h: 330, s: 68, l: 58 }, // pink/rose

  // Zemeljske barve — nizka nasičenost/svetlost, vmesni odtenki.
  { h: 15, s: 45, l: 32 }, // rjava
  { h: 45, s: 40, l: 34 }, // karamela/taupe
  { h: 75, s: 38, l: 32 }, // olivna
  { h: 105, s: 35, l: 32 }, // temno olivno zelena
  { h: 195, s: 30, l: 38 }, // petrolej
  { h: 225, s: 30, l: 40 }, // sivo-modra (slate)
  { h: 255, s: 28, l: 42 }, // sivo-indigo
  { h: 315, s: 32, l: 40 }, // slive/mauve
  { h: 345, s: 40, l: 34 }, // bordo/maroon

  // Čisti sivi.
  { h: 0, s: 0, l: 42 },
  { h: 0, s: 0, l: 62 },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function authorSwatch(author: string): Swatch {
  return PALETTE[hashString(author) % PALETTE.length];
}

// h/s/l trojica za mesta, ki barvo sestavijo z hsl() neposredno (SongCard).
export function authorAccentHsl(author: string): Swatch {
  return authorSwatch(author);
}

// Ista barva kot zgoraj, a kot "#rrggbb" — za mesta, kjer se barva sestavi s
// konkatenacijo hex alfa vrednosti (npr. `${accent}26`) in hsl() ni mogoč.
export function authorAccentHex(author: string): string {
  const { h, s, l } = authorSwatch(author);
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
