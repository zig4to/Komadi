import { ERAS, GENRES } from "@/lib/constants";
import type { NewSong } from "@/types/song";

export interface ParsedImport {
  songs: NewSong[];
  warnings: string[];
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeKey(s: string): string {
  return stripDiacritics(s).trim().toLowerCase();
}

const KEY_AUTHOR = new Set(["avtor", "author", "izvajalec"]);
const KEY_GENRE = new Set(["zanr", "genre"]);
const KEY_ERA = new Set(["obdobje", "era"]);
const KEY_MOOD = new Set(["razpolozenje", "mood"]);
const KEY_ORIGIN = new Set(["izvor", "origin"]);
const KEY_FAVORITE = new Set(["priljubljena", "priljubljeno", "favorite"]);
const TRUE_VALUES = new Set(["da", "ja", "yes", "true", "1"]);

function matchGenre(raw: string): { value: (typeof GENRES)[number]; warning?: string } {
  const found = GENRES.find((g) => normalizeKey(g) === normalizeKey(raw));
  if (found) return { value: found };
  return {
    value: GENRES[0],
    warning: `žanr "${raw}" ni prepoznan — uporabljen privzeti "${GENRES[0]}"`,
  };
}

function matchEra(raw: string): { value: (typeof ERAS)[number]; warning?: string } {
  const found = ERAS.find((e) => normalizeKey(e) === normalizeKey(raw));
  if (found) return { value: found };
  return {
    value: ERAS[0],
    warning: `obdobje "${raw}" ni prepoznano — uporabljeno privzeto "${ERAS[0]}"`,
  };
}

// Parsira uvozno .txt besedilo v seznam skladb za vstavljanje v bazo. Glej
// razdelek "Uvoz skladb" v README za natančen opis formata.
export function parseImportText(text: string): ParsedImport {
  const lines = text.split(/\r?\n/);
  const songs: NewSong[] = [];
  const warnings: string[] = [];

  let currentAuthor: string | null = null;
  let current: {
    title: string;
    genre: (typeof GENRES)[number];
    era: (typeof ERAS)[number];
    mood: string | null;
    origin: string | null;
    favorite: boolean;
  } | null = null;

  function flush() {
    if (current && currentAuthor) {
      songs.push({
        title: current.title,
        author: currentAuthor,
        genre: current.genre,
        era: current.era,
        mood: current.mood,
        origin: current.origin,
        favorite: current.favorite,
      });
    }
    current = null;
  }

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const lineNo = i + 1;
    if (!line) return;

    const colonIdx = line.indexOf(":");
    const key = colonIdx === -1 ? "" : normalizeKey(line.slice(0, colonIdx));
    const value = colonIdx === -1 ? "" : line.slice(colonIdx + 1).trim();

    if (colonIdx !== -1 && KEY_AUTHOR.has(key)) {
      flush();
      currentAuthor = value;
      return;
    }

    if (colonIdx !== -1 && KEY_GENRE.has(key)) {
      if (!current) {
        warnings.push(`vrstica ${lineNo}: "Žanr" brez pred tem navedene skladbe — preskočeno`);
        return;
      }
      const { value: genre, warning } = matchGenre(value);
      current.genre = genre;
      if (warning) warnings.push(`vrstica ${lineNo} (${current.title}): ${warning}`);
      return;
    }

    if (colonIdx !== -1 && KEY_ERA.has(key)) {
      if (!current) {
        warnings.push(`vrstica ${lineNo}: "Obdobje" brez pred tem navedene skladbe — preskočeno`);
        return;
      }
      const { value: era, warning } = matchEra(value);
      current.era = era;
      if (warning) warnings.push(`vrstica ${lineNo} (${current.title}): ${warning}`);
      return;
    }

    if (colonIdx !== -1 && KEY_MOOD.has(key)) {
      if (!current) {
        warnings.push(`vrstica ${lineNo}: "Razpoloženje" brez pred tem navedene skladbe — preskočeno`);
        return;
      }
      current.mood = value || null;
      return;
    }

    if (colonIdx !== -1 && KEY_ORIGIN.has(key)) {
      if (!current) {
        warnings.push(`vrstica ${lineNo}: "Izvor" brez pred tem navedene skladbe — preskočeno`);
        return;
      }
      current.origin = value || null;
      return;
    }

    if (colonIdx !== -1 && KEY_FAVORITE.has(key)) {
      if (!current) {
        warnings.push(`vrstica ${lineNo}: "Priljubljena" brez pred tem navedene skladbe — preskočeno`);
        return;
      }
      current.favorite = TRUE_VALUES.has(normalizeKey(value));
      return;
    }

    // Ni prepoznan ključ ("Ključ: vrednost") → nova skladba (naslov).
    flush();
    if (!currentAuthor) {
      warnings.push(`vrstica ${lineNo}: skladba "${line}" brez avtorja (manjka "Avtor:" pred njo) — preskočeno`);
      return;
    }
    current = {
      title: line,
      genre: GENRES[0],
      era: ERAS[0],
      mood: null,
      origin: null,
      favorite: false,
    };
  });

  flush();

  return { songs, warnings };
}

// Parsira uvozno .json besedilo (seznam objektov {title, author, genre?,
// era?, mood?, origin?, favorite?}) v enako obliko kot parseImportText.
export function parseImportJson(text: string): ParsedImport {
  const songs: NewSong[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { songs: [], warnings: ["Datoteka ni veljaven JSON."] };
  }

  if (!Array.isArray(raw)) {
    return { songs: [], warnings: ["JSON mora biti seznam (array) skladb."] };
  }

  raw.forEach((item, i) => {
    const idx = i + 1;
    if (!item || typeof item !== "object") {
      warnings.push(`element ${idx}: ni objekt — preskočeno`);
      return;
    }
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const author = typeof o.author === "string" ? o.author.trim() : "";
    if (!title || !author) {
      warnings.push(`element ${idx}: manjka "title" ali "author" — preskočeno`);
      return;
    }

    let genre: (typeof GENRES)[number] = GENRES[0];
    if (typeof o.genre === "string" && o.genre.trim()) {
      const m = matchGenre(o.genre);
      genre = m.value;
      if (m.warning) warnings.push(`element ${idx} (${title}): ${m.warning}`);
    }

    let era: (typeof ERAS)[number] = ERAS[0];
    if (typeof o.era === "string" && o.era.trim()) {
      const m = matchEra(o.era);
      era = m.value;
      if (m.warning) warnings.push(`element ${idx} (${title}): ${m.warning}`);
    }

    const mood = typeof o.mood === "string" && o.mood.trim() ? o.mood.trim() : null;
    const origin = typeof o.origin === "string" && o.origin.trim() ? o.origin.trim() : null;

    let favorite = false;
    if (typeof o.favorite === "boolean") favorite = o.favorite;
    else if (typeof o.favorite === "string") favorite = TRUE_VALUES.has(normalizeKey(o.favorite));

    songs.push({ title, author, genre, era, mood, origin, favorite });
  });

  return { songs, warnings };
}
