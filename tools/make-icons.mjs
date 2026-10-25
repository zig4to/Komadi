// Ikone aplikacije (PWA, favicon, apple-touch) v istem slogu kot TomStudios:
// navaden diagonalni preliv barv aplikacije (roza #ec4899 → oranžna #f97316, kot
// kartica Komadi v TomStudios), zaobljen kvadrat (r = 7/24), bel znak — trzalica.
// Zagon:  node tools/make-icons.mjs                 → public/icons/ (izbrani VARIANT)
//         node tools/make-icons.mjs --preview f.png → pregled vseh različic
// (sharp je že v node_modules prek Next.)
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VARIANT = "zap1";
const A = "#ec4899";
const B = "#f97316";

// Trzalica s konico spodaj, v koordinatah 0–512, središče ~ (256, 258), višina 292.
const PICK = "M256 112 C372 112 410 168 388 236 C366 304 306 372 256 404 C206 372 146 304 124 236 C102 168 140 112 256 112 Z";
const pick = (t = "", attrs = "") => `<path d="${PICK}" transform="${t}" ${attrs}/>`;
// Trzalica, zavrtena okoli svojega središča in pomanjšana.
const at = (x, y, s, rot) => `translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-256 -258)`;

const STROKE = 24;
const gapMask = (id, t) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    <rect width="512" height="512" fill="#fff"/>
    ${pick(t, `fill="#000" stroke="#000" stroke-width="${STROKE * 1.7}" stroke-linejoin="round"`)}
  </mask>`;

// Tri trzalice v krogu okoli središča (256, 262): levo spodaj, zgoraj na sredini, desno spodaj.
// Vsaka je zakrita z vrzeljo naslednje, zato se v krogu prekrivajo ena za drugo.
function ring(tipsIn, scale, radius) {
  const ts = [150, 270, 30].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = 256 + radius * Math.cos(a), y = 262 + radius * Math.sin(a);
    return at(x, y, scale, tipsIn ? deg + 90 : deg - 90);
  });
  return ts.map((t, i) => gapMask(`r${i}`, ts[(i + 1) % 3])).join("") +
    ts.map((t, i) => `<g mask="url(#r${i})">${pick(t, 'fill="#fff"')}</g>`).join("");
}

// Polna trzalica z izrezanim preprostim vzorcem (`cut` = črne oblike v maski).
function cutPick(id, cut) {
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><g fill="#000">${cut}</g>
    </mask>
    <g mask="url(#${id})">${pick("", 'fill="#fff"')}</g>`;
}
const bar = (x, y, w, h) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}"/>`;

// Strela kot v aplikaciji (Lucide "zap", 24×24), postavljena v središče (x, y) z velikostjo s (px na enoto).
const ZAP = "M13 2 3 14h9l-1 8 10-12h-9l1-8z";
const zap = (x, y, s, rot = 0, attrs = "") =>
  `<path d="${ZAP}" transform="translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(-12 -12)" stroke-linejoin="round" ${attrs}/>`;
// Polna trzalica z izrezom, ki je lahko obris (stroke) — maska z belo ploskvijo in črnim izrezom.
const maskPick = (id, cut, t = "") => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    <rect width="512" height="512" fill="#fff"/>${cut}</mask><g mask="url(#${id})">${pick(t, 'fill="#fff"')}</g>`;

const VARIANTS = {
  solid: { label: "Polna", glyph: () => pick("", 'fill="#fff"') },
  outline: {
    label: "Obris",
    glyph: () => pick(at(256, 258, 0.92, 0), `fill="none" stroke="#fff" stroke-width="${STROKE / 0.92}" stroke-linejoin="round"`),
  },
  // Dve polni trzalici, med njima vrzel v barvi ozadja.
  pair: {
    label: "Dve, prekrivanje",
    glyph: () => {
      const back = at(206, 206, 0.6, 0), front = at(312, 314, 0.6, 0);
      return `${gapMask("gap", front)}
        <g mask="url(#gap)">${pick(back, 'fill="#fff"')}</g>
        ${pick(front, 'fill="#fff"')}`;
    },
  },
  // Tri polne trzalice: sprednja večja, zadnji dve nagnjeni ob straneh, z vrzeljo okoli sprednje.
  fan: {
    label: "Tri",
    glyph: () => {
      const l = at(166, 226, 0.5, -16), r = at(346, 226, 0.5, 16), c = at(256, 286, 0.64, 0);
      return `${gapMask("gap", c)}
        <g mask="url(#gap)">${pick(l, 'fill="#fff"')}${pick(r, 'fill="#fff"')}</g>
        ${pick(c, 'fill="#fff"')}`;
    },
  },
  // --- variacije polne (1) in treh (4) ---
  tilted: { label: "Polna, nagnjena", glyph: () => pick(at(256, 258, 0.96, -18), 'fill="#fff"') },
  // Polna trzalica z notranjo tanko črto (izrez), kot vtisnjen rob.
  inset: {
    label: "Polna z notranjim robom",
    glyph: () => `<mask id="in" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        ${pick(at(256, 252, 0.74, 0), 'fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round"')}
      </mask>
      <g mask="url(#in)">${pick("", 'fill="#fff"')}</g>`,
  },
  // Polna trzalica, prerezana z diagonalno vrzeljo.
  split: {
    label: "Polna, prerezana",
    glyph: () => `<mask id="sp" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <rect x="-60" y="244" width="640" height="26" fill="#000" transform="rotate(-24 256 257)"/>
      </mask>
      <g mask="url(#sp)">${pick("", 'fill="#fff"')}</g>`,
  },
  // Dve: sprednja polna, druga pokuka izza nje nagnjena v desno.
  peek: {
    label: "Dve, ena za drugo",
    glyph: () => {
      const back = at(304, 238, 0.66, 22), front = at(230, 276, 0.72, -6);
      return `${gapMask("gap", front)}
        <g mask="url(#gap)">${pick(back, 'fill="#fff"')}</g>
        ${pick(front, 'fill="#fff"')}`;
    },
  },
  // Tri enake, pahljača iz skupne konice (zadnji dve nagnjeni bolj, z vrzelmi).
  fan3: {
    label: "Tri, pahljača",
    glyph: () => {
      const tip = (rot) => `rotate(${rot} 256 402) translate(256 402) scale(0.6) translate(-256 -404)`;
      const l = tip(-30), r = tip(30), c = tip(0);
      return `${gapMask("gap", c)}
        <g mask="url(#gap)">${pick(l, 'fill="#fff"')}${pick(r, 'fill="#fff"')}</g>
        ${pick(c, 'fill="#fff"')}`;
    },
  },
  // Tri v stolpcu, zamaknjene navzgor kot kup.
  stack: {
    label: "Tri, kup",
    glyph: () => {
      const a = at(256, 188, 0.5, 0), b = at(256, 248, 0.56, 0), c = at(256, 316, 0.62, 0);
      return `${gapMask("gb", b)}${gapMask("gc", c)}
        <g mask="url(#gc)"><g mask="url(#gb)">${pick(a, 'fill="#fff"')}</g>${pick(b, 'fill="#fff"')}</g>
        ${pick(c, 'fill="#fff"')}`;
    },
  },
  // Tri, kot 4, a vse enako velike in v loku.
  arc: {
    label: "Tri v loku",
    glyph: () => {
      const l = at(168, 248, 0.52, -24), r = at(344, 248, 0.52, 24), c = at(256, 270, 0.58, 0);
      return `${gapMask("gap", c)}
        <g mask="url(#gap)">${pick(l, 'fill="#fff"')}${pick(r, 'fill="#fff"')}</g>
        ${pick(c, 'fill="#fff"')}`;
    },
  },
  // --- tri trzalice v krogu: levo, sredina, desno, vsaka delno za naslednjo ---
  // Konice proti središču; vsaka je zakrita z vrzeljo naslednje (krožno: A pod B, B pod C, C pod A).
  ringIn: { label: "Krog, konice noter", glyph: () => ring(true, 0.54, 80) },
  ringOut: { label: "Krog, konice ven", glyph: () => ring(false, 0.5, 92) },
  ringTight: { label: "Krog, tesno", glyph: () => ring(true, 0.56, 70) },
  // V loku od leve proti desni: leva zadaj, desna spredaj.
  cascade: {
    label: "Lok, ena za drugo",
    glyph: () => {
      const l = at(170, 268, 0.56, -26), m = at(256, 236, 0.56, 0), r = at(342, 268, 0.56, 26);
      return `${gapMask("gm", m)}${gapMask("gr", r)}
        <g mask="url(#gr)"><g mask="url(#gm)">${pick(l, 'fill="#fff"')}</g>${pick(m, 'fill="#fff"')}</g>
        ${pick(r, 'fill="#fff"')}`;
    },
  },
  // --- polna z minimalističnim vzorcem ---
  hole: { label: "Zvočna luknja", glyph: () => cutPick("c1", `<circle cx="256" cy="236" r="44"/>`) },
  dots: {
    label: "Prijemi (3 pike)",
    glyph: () => cutPick("c2", `<circle cx="214" cy="214" r="20"/><circle cx="298" cy="214" r="20"/><circle cx="256" cy="282" r="20"/>`),
  },
  frets: {
    label: "Strune in prag",
    glyph: () => cutPick("c3", [216, 256, 296].map((x) => bar(x, 240, 12, 150)).join("") + bar(256, 214, 120, 12)),
  },
  eq: {
    label: "Equalizer",
    glyph: () => cutPick("c4", bar(212, 246, 22, 70) + bar(256, 236, 22, 130) + bar(300, 252, 22, 90)),
  },
  wave: {
    label: "Zvočni val",
    glyph: () => `<mask id="c5" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <path d="M168 240 C196 196 222 196 236 240 S276 284 290 240 S330 196 344 240" fill="none" stroke="#000" stroke-width="18" stroke-linecap="round"/>
      </mask>
      <g mask="url(#c5)">${pick("", 'fill="#fff"')}</g>`,
  },
  play: { label: "Predvajaj", glyph: () => cutPick("c6", `<path d="M232 186 L310 236 Q316 240 310 244 L232 294 Q224 299 224 290 V190 Q224 181 232 186 Z"/>`) },
  pluck: {
    label: "Struna (zabrenkana)",
    glyph: () => `<mask id="c7" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <path d="M256 150 Q296 240 256 330" fill="none" stroke="#000" stroke-width="14" stroke-linecap="round"/>
        <path d="M220 160 V320 M292 160 V320" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round" opacity="0"/>
      </mask>
      <g mask="url(#c7)">${pick("", 'fill="#fff"')}</g>`,
  },
  chordgrid: {
    label: "Mini akordni diagram",
    glyph: () => cutPick("c8",
      [208, 240, 272, 304].map((x) => bar(x, 248, 8, 120)).join("") +
      [208, 248, 288].map((y) => bar(256, y, 104, 8)).join("") +
      `<circle cx="240" cy="228" r="13"/><circle cx="272" cy="268" r="13"/>`),
  },
  // --- polna z vzorcem, drugi niz ---
  rosette: {
    label: "Luknja z rozeto",
    glyph: () => `<mask id="d1" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/><circle cx="256" cy="236" r="36" fill="#000"/>
        <circle cx="256" cy="236" r="56" fill="none" stroke="#000" stroke-width="9"/>
      </mask><g mask="url(#d1)">${pick("", 'fill="#fff"')}</g>`,
  },
  heart: {
    label: "Srce",
    glyph: () => cutPick("d2", `<path d="M256 296 C214 266 188 244 188 214 C188 192 204 178 223 178 C238 178 250 187 256 200 C262 187 274 178 289 178 C308 178 324 192 324 214 C324 244 298 266 256 296 Z"/>`),
  },
  bolt: { label: "Strela (Jam)", glyph: () => cutPick("d3", `<path d="M270 168 L214 250 H252 L240 316 L300 228 H260 Z"/>`) },
  arcs: {
    label: "Zvok v loku",
    glyph: () => `<mask id="d4" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/><circle cx="256" cy="292" r="15" fill="#000"/>
        <g fill="none" stroke="#000" stroke-width="15" stroke-linecap="round">
          <path d="M214 258 A60 60 0 0 1 298 258"/><path d="M186 226 A100 100 0 0 1 326 226"/>
        </g>
      </mask><g mask="url(#d4)">${pick("", 'fill="#fff"')}</g>`,
  },
  waveform: {
    label: "Valovna oblika (5)",
    glyph: () => cutPick("d5", [[192, 44], [224, 92], [256, 130], [288, 92], [320, 44]].map(([x, h]) => bar(x, 238, 18, h)).join("")),
  },
  eq4: {
    label: "Equalizer (4)",
    glyph: () => cutPick("d6", bar(202, 254, 20, 56) + bar(238, 232, 20, 112) + bar(274, 244, 20, 80) + bar(310, 226, 20, 124)),
  },
  letterK: {
    label: "Črka K",
    glyph: () => cutPick("d7", `<rect x="206" y="176" width="28" height="132" rx="6"/>
      <path d="M234 248 L290 176 H324 L266 250 L326 308 H290 Z"/>`),
  },
  inlays: { label: "Pike na vratu", glyph: () => cutPick("d8", `<circle cx="256" cy="206" r="22"/><circle cx="256" cy="272" r="22"/>`) },
  minipick: {
    label: "Trzalica v trzalici",
    glyph: () => cutPick("d9", pick(at(256, 244, 0.34, 0), "")),
  },
  metronome: {
    label: "Metronom",
    glyph: () => `<mask id="d10" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <path d="M236 178 H276 L312 304 H200 Z" fill="none" stroke="#000" stroke-width="13" stroke-linejoin="round"/>
        <path d="M256 284 L296 196" stroke="#000" stroke-width="13" stroke-linecap="round"/>
      </mask><g mask="url(#d10)">${pick("", 'fill="#fff"')}</g>`,
  },
  // --- trzalica s strelo (Jam) ---
  zap1: { label: "Strela (Lucide)", glyph: () => maskPick("z1", zap(256, 244, 6, 0, 'fill="#000" stroke="#000" stroke-width="1.2"')) },
  zap2: { label: "Večja strela", glyph: () => maskPick("z2", zap(256, 248, 8, 0, 'fill="#000" stroke="#000" stroke-width="1.2"')) },
  zap3: { label: "Obris strele", glyph: () => maskPick("z3", zap(256, 244, 7, 0, 'fill="none" stroke="#000" stroke-width="2"')) },
  zap4: { label: "Nagnjena", glyph: () => maskPick("z4", zap(256, 244, 7, 0, 'fill="#000" stroke="#000" stroke-width="1.2"'), at(256, 258, 0.96, -16)) },
  // Obris trzalice, v njej polna bela strela.
  zap5: {
    label: "Obris + strela",
    glyph: () => pick(at(256, 258, 0.92, 0), `fill="none" stroke="#fff" stroke-width="${STROKE / 0.92}" stroke-linejoin="round"`) +
      zap(256, 244, 6.2, 0, 'fill="#fff" stroke="#fff" stroke-width="1.2"'),
  },
  // Trzalica, prelomljena s cikcak vrzeljo v obliki strele (dve polovici).
  zap6: {
    label: "Prelomljena",
    glyph: () => maskPick("z6", `<path d="M300 96 L232 238 L282 238 L214 420" fill="none" stroke="#000" stroke-width="22" stroke-linejoin="miter" stroke-linecap="square"/>`),
  },
  // Strela z iskrami (dve majhni piki).
  zap7: {
    label: "Strela z iskrami",
    glyph: () => maskPick("z7", zap(252, 248, 6.4, 0, 'fill="#000" stroke="#000" stroke-width="1.2"') +
      `<circle cx="318" cy="186" r="11" fill="#000"/><circle cx="192" cy="304" r="9" fill="#000"/>`),
  },
  // Ostra strela (brez zaobljenih kotov), daljša.
  zap8: { label: "Ostra strela", glyph: () => maskPick("z8", `<path d="M282 150 L206 262 H254 L232 344 L314 222 H264 Z" fill="#000"/>`) },
  // Strela z obrobo v barvi trzalice (tanek bel rob okoli izreza).
  zap9: {
    label: "Strela z robom",
    glyph: () => maskPick("z9", zap(256, 244, 7, 0, 'fill="none" stroke="#000" stroke-width="1.6"')) +
      zap(256, 244, 7, 0, 'fill="none" stroke="none"') +
      `<g>${zap(256, 244, 4.4, 0, 'fill="#000" opacity="0"')}</g>` +
      `<mask id="z9b" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#000"/>${zap(256, 244, 7, 0, 'fill="#fff"')}</mask>` +
      `<g mask="url(#z9b)">${zap(256, 244, 4.6, 0, 'fill="#fff" stroke="#fff" stroke-width="1.5"')}</g>`,
  },
  // Strela in valovi: strela ter loki zvoka ob strani.
  zap10: {
    label: "Strela + zvok",
    glyph: () => maskPick("z10", zap(244, 246, 6, 0, 'fill="#000" stroke="#000" stroke-width="1.2"') +
      `<path d="M304 206 A52 52 0 0 1 304 282" fill="none" stroke="#000" stroke-width="13" stroke-linecap="round"/>`),
  },
  // Vzorec: mreža polnih trzalic, izmenično obrnjenih.
  pattern: {
    label: "Vzorec",
    glyph: () => {
      let out = "";
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
          out += pick(at(160 + col * 96, 162 + row * 96, 0.27, (row + col) % 2 ? 180 : 0), 'fill="#fff"');
      return out;
    },
  },
  // Polna trzalica z izrezano noto.
  note: {
    label: "Z izrezano noto",
    glyph: () => `<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <rect width="512" height="512" fill="#fff"/>
        <g fill="#000" transform="translate(256 248) scale(0.42) translate(-268 -262)">
          <ellipse cx="190" cy="352" rx="60" ry="45" transform="rotate(-20 190 352)"/>
          <ellipse cx="342" cy="322" rx="60" ry="45" transform="rotate(-20 342 322)"/>
          <rect x="222" y="168" width="28" height="186" rx="6"/>
          <rect x="374" y="138" width="28" height="186" rx="6"/>
          <path d="M222 156 L402 122 Q408 121 408 128 L408 168 Q408 174 402 175 L228 208 Q222 209 222 202 Z"/>
        </g>
      </mask>
      <g mask="url(#cut)">${pick("", 'fill="#fff"')}</g>`,
  },
};

export function svg({ variant = VARIANT, rounded = true, glyphScale = 1 } = {}) {
  const r = rounded ? Math.round((512 * 7) / 24) : 0;
  const t = `translate(256 256) scale(${glyphScale}) translate(-256 -258)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${A}"/>
      <stop offset="1" stop-color="${B}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <g transform="${t}">${VARIANTS[variant].glyph()}</g>
</svg>`;
}

const png = (s, size) => sharp(Buffer.from(s), { density: 72 * (size / 512) * 4 }).resize(size, size).png();

const preview = process.argv.indexOf("--preview");
if (preview >= 0) {
  const only = process.argv.indexOf("--only");
  const keys = only >= 0 ? process.argv[only + 1].split(",") : Object.keys(VARIANTS);
  const S = 220, PAD = 28, LABEL = 34, COLS = 3;
  const rows = Math.ceil(keys.length / COLS);
  const W = COLS * (S + PAD) + PAD, H = rows * (S + PAD + LABEL) + PAD;
  const layers = [];
  let labels = "";
  for (const [i, v] of keys.entries()) {
    const x = PAD + (i % COLS) * (S + PAD), y = PAD + Math.floor(i / COLS) * (S + PAD + LABEL);
    layers.push({ input: await png(svg({ variant: v }), S).toBuffer(), left: x, top: y });
    labels += `<text x="${x + S / 2}" y="${y + S + 24}" text-anchor="middle" font-family="Arial" font-size="17" fill="#e5e7eb">${i + 1}. ${VARIANTS[v].label}</text>`;
  }
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#111318"/>${labels}</svg>`;
  await sharp(Buffer.from(bg)).composite(layers).png().toFile(process.argv[preview + 1]);
  console.log("✓", process.argv[preview + 1]);
} else {
  const OUT = new URL("../public/icons/", import.meta.url);
  const jobs = [
    { file: "icon-192.png", size: 192, rounded: true, glyphScale: 1 },
    { file: "icon-512.png", size: 512, rounded: true, glyphScale: 1 },
    { file: "icon-maskable-192.png", size: 192, rounded: false, glyphScale: 0.82 },
    { file: "icon-maskable-512.png", size: 512, rounded: false, glyphScale: 0.82 },
    { file: "apple-touch-icon.png", size: 180, rounded: false, glyphScale: 0.9 },
  ];
  writeFileSync(new URL("icon.svg", OUT), svg());
  for (const j of jobs) {
    writeFileSync(fileURLToPath(new URL(j.file, OUT)), await png(svg(j), j.size).toBuffer());
    console.log("✓", j.file);
  }
}
